# Invoice Extractor Backend

Backend serverless para extracción automática de ítems de facturas usando Azure Form Recognizer y Google Gemini.

## Arquitectura (Opción B - Asíncrona)

```
Frontend (Vercel)
    ↓
[Upload imagen a GCS Bucket]
    ↓
Cloud Function (trigger automático)
    ↓
Cloud Run (procesamiento)
    ↓
Firestore (resultados)
    ↑
Frontend (polling/realtime listener)
```

## Flujo de Procesamiento

1. **Usuario sube imagen** desde el frontend (Vercel app)
2. **Imagen se guarda** en Google Cloud Storage bucket
3. **Cloud Function se dispara** automáticamente por el evento de upload
4. **Cloud Function crea documento** en Firestore con status='pending'
5. **Cloud Function llama** al backend en Cloud Run
6. **Cloud Run procesa** la imagen:
   - Intenta con Azure Form Recognizer primero
   - Si falla o detecta errores, usa Gemini
   - Aplica transformaciones específicas por proveedor
7. **Cloud Run guarda resultado** en Firestore con status='completed'
8. **Frontend recibe actualización** en tiempo real vía Firestore listener

## Estructura del Proyecto

```
.
├── main.py                    # API Flask principal
├── Dockerfile                 # Container para Cloud Run
├── requirements.txt           # Dependencias Python
├── .env.example              # Template de variables de entorno
├── src/
│   ├── __init__.py
│   ├── config.py             # Configuración (env vars)
│   ├── processor.py          # Lógica principal de procesamiento
│   ├── gemini_client.py      # Cliente de Gemini API
│   ├── utils.py              # Utilidades y validaciones
│   └── supplier_plugins.py   # Sistema de plugins por proveedor
├── proveedores/              # Plugins específicos por proveedor
│   ├── __init__.py
│   ├── arcucci.py
│   ├── quilmes.py
│   └── ...
├── cloud_function/           # Trigger de Cloud Storage
│   ├── main.py
│   └── requirements.txt
└── credentials/              # Credenciales (no commitear)
    ├── README.md
    └── service-account.json  (git ignored)
```

## Setup Local

### 1. Clonar repositorio

```bash
git clone https://github.com/MateoLesni/extractor_facturas_azgem.git
cd extractor_facturas_azgem
```

### 2. Crear virtual environment

```bash
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_KEY=your-azure-key

GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=credentials/service-account.json

GEMINI_API_KEY=your-gemini-api-key

FIRESTORE_COLLECTION=invoices
BUCKET_NAME=invoice-uploads

ENVIRONMENT=development
PORT=8080
```

### 5. Configurar credenciales de Google Cloud

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear Service Account con permisos:
   - Cloud Storage Admin
   - Cloud Datastore User
3. Descargar JSON key
4. Guardar como `credentials/service-account.json`

### 6. Correr localmente

```bash
python main.py
```

El servidor estará en `http://localhost:8080`

## Deployment a Cloud Run

### 1. Configurar Google Cloud CLI

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Build y deploy

```bash
# Build container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/invoice-extractor

# Deploy a Cloud Run
gcloud run deploy invoice-extractor \
  --image gcr.io/YOUR_PROJECT_ID/invoice-extractor \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars AZURE_ENDPOINT=your-endpoint,AZURE_KEY=your-key,GEMINI_API_KEY=your-key,GOOGLE_CLOUD_PROJECT=your-project,FIRESTORE_COLLECTION=invoices,BUCKET_NAME=invoice-uploads \
  --timeout 3600 \
  --memory 2Gi \
  --cpu 2
```

**Nota:** Guarda la URL de Cloud Run que te da (ej: `https://invoice-extractor-xxx.run.app`)

## Deployment de Cloud Function

```bash
cd cloud_function

gcloud functions deploy process-invoice-upload \
  --gen2 \
  --runtime python311 \
  --region us-central1 \
  --source . \
  --entry-point process_invoice_upload \
  --trigger-bucket invoice-uploads \
  --set-env-vars CLOUD_RUN_URL=https://invoice-extractor-xxx.run.app,FIRESTORE_COLLECTION=invoices \
  --timeout 540s \
  --memory 512MB
```

## API Endpoints

### `GET /health`
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-08T10:30:00Z",
  "service": "invoice-extractor"
}
```

### `POST /process-invoice`
Procesar una factura (llamado por Cloud Function)

**Request:**
```json
{
  "image_id": "unique-id-123",
  "bucket_name": "invoice-uploads",
  "file_name": "facturas/arcucci_001.jpg",
  "mime_type": "image/jpeg",
  "metadata": {
    "local_id": "local_san_martin",
    "user_id": "user_456"
  }
}
```

**Response:**
```json
{
  "success": true,
  "image_id": "unique-id-123",
  "items_count": 25,
  "processing_time": 8.5
}
```

### `GET /invoice/{invoice_id}`
Obtener estado y resultados de una factura

**Response:**
```json
{
  "status": "completed",
  "filename": "facturas/arcucci_001.jpg",
  "items": [
    {
      "Codigo": "12345",
      "Descripcion": "Coca Cola 2.25L",
      "Cantidad": 12,
      "PrecioUnitario": 850.50,
      "Subtotal": 10206.00
    }
  ],
  "metadata": {
    "items_count": 25,
    "used_gemini": false,
    "processing_time_seconds": 8.5
  },
  "completed_at": "2025-12-08T10:30:45Z"
}
```

## Estructura de Firestore

### Collection: `invoices`

```javascript
{
  // Document ID = image_id
  "img_123abc": {
    "status": "completed", // pending | processing | completed | failed
    "filename": "facturas/arcucci_001.jpg",
    "mime_type": "image/jpeg",
    "bucket": "invoice-uploads",

    // Timestamps
    "created_at": Timestamp,
    "processing_started_at": Timestamp,
    "completed_at": Timestamp,

    // Results
    "items": [
      {
        "Codigo": "12345",
        "Descripcion": "Coca Cola 2.25L",
        "Cantidad": 12,
        "PrecioUnitario": 850.50,
        "Subtotal": 10206.00
      }
    ],

    // Metadata
    "metadata": {
      "local_id": "local_san_martin",
      "user_id": "user_456",
      "items_count": 25,
      "used_gemini": false,
      "processing_time_seconds": 8.5
    },

    // Error (si falló)
    "error": null
  }
}
```

## Integración con Frontend

### Subir imagen y escuchar resultado

```javascript
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';

// 1. Subir imagen a Cloud Storage
const storage = getStorage();
const db = getFirestore();

async function uploadInvoice(file, metadata) {
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const storageRef = ref(storage, `facturas/${imageId}_${file.name}`);

  // Subir con metadata
  await uploadBytes(storageRef, file, {
    customMetadata: {
      image_id: imageId,
      local_id: metadata.localId,
      user_id: metadata.userId
    }
  });

  // 2. Escuchar cambios en Firestore
  const docRef = doc(db, 'invoices', imageId);

  const unsubscribe = onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();

      if (data.status === 'completed') {
        console.log('Procesado!', data.items);
        updateUI(imageId, data);
        unsubscribe(); // Dejar de escuchar
      } else if (data.status === 'failed') {
        console.error('Error:', data.error);
        showError(imageId, data.error);
        unsubscribe();
      } else {
        console.log('Estado:', data.status);
        updateProgress(imageId, data.status);
      }
    }
  });

  return imageId;
}
```

## Costos Estimados (400 imágenes/día)

| Servicio | Costo mensual |
|----------|---------------|
| Cloud Storage (24GB) | $0.48 |
| Cloud Functions (12K invocaciones) | Gratis |
| Cloud Run (~67 horas/mes) | $1.60 |
| Firestore (12K writes + 50MB) | Gratis |
| Azure Form Recognizer (12K imágenes) | $11.50 |
| Gemini API (~120 imágenes fallback) | $0.30 |
| **TOTAL** | **~$14/mes** |

## Plugins de Proveedores

Los plugins en `proveedores/` permiten personalizar el procesamiento por proveedor:

```python
# proveedores/arcucci.py

PATTERNS = [r"arcucci", r"arcu"]  # Regex para detectar proveedor

PROMPT = """
Esta factura es de Arcucci.
Características especiales:
- El código puede estar en la columna 'Art.'
- Los subtotales incluyen IVA
"""

def transform_items(items):
    """Transformación post-Gemini"""
    for item in items:
        # Lógica específica de Arcucci
        if item['Codigo'] and item['Codigo'].startswith('ARC'):
            item['Codigo'] = item['Codigo'][3:]  # Quitar prefijo
    return items
```

## Troubleshooting

### Error: "Missing required environment variables"
- Verificar que `.env` tenga todas las variables
- En Cloud Run, verificar que las env vars estén configuradas

### Error: "Azure failed"
- Verificar endpoint y key de Azure
- Puede usar `SKIP_AZURE=1` para forzar solo Gemini

### Error: "Firestore permission denied"
- Verificar que el Service Account tenga permisos de Firestore
- En Cloud Run, verificar que tenga el Service Account correcto

### Imágenes no se procesan
- Verificar que Cloud Function esté deployada
- Verificar logs: `gcloud functions logs read process-invoice-upload`
- Verificar que CLOUD_RUN_URL esté configurada correctamente

## Seguridad

- ✅ **Nunca commitear** archivos `.env` o `credentials/*.json`
- ✅ Usar **Secret Manager** de GCP para producción
- ✅ Rotar API keys regularmente
- ✅ Configurar **IAM roles** mínimos necesarios

## Monitoreo

Ver logs en Cloud Run:
```bash
gcloud run logs read invoice-extractor --region us-central1
```

Ver logs de Cloud Function:
```bash
gcloud functions logs read process-invoice-upload --region us-central1
```

## Licencia

MIT
