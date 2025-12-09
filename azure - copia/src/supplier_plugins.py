"""
Supplier plugin system
Loads supplier-specific transformations and prompts from proveedores/ directory
"""
import re
import sys
import pkgutil
import importlib
from pathlib import Path
from typing import Callable, Optional, Tuple, List, Dict

SupplierTransform = Callable[[List[Dict]], List[Dict]]
SupplierShould = Callable[[List[Dict]], Tuple[bool, List[str]]]


def resolve_supplier_plugin(filename: str) -> Tuple[str, Optional[str], Optional[SupplierTransform], Optional[SupplierTransform], Optional[SupplierShould]]:
    """
    Resolve supplier-specific plugin based on filename

    Args:
        filename: Invoice filename

    Returns:
        (extra_prompt, plugin_source, transform_azure_fn, transform_items_fn, should_fn)
    """
    proveedores_path = Path("proveedores")
    if not proveedores_path.exists() or not proveedores_path.is_dir():
        return "", None, None, None, None

    parent = str(proveedores_path.parent.resolve())
    if parent not in sys.path:
        sys.path.insert(0, parent)

    # 1) Try proveedores/archivos.py (optional central dispatch)
    try:
        mod_archivos = importlib.import_module("proveedores.archivos")
        if hasattr(mod_archivos, "get_prompt_for_filename"):
            try:
                p = mod_archivos.get_prompt_for_filename(filename)
                if p:
                    return (
                        str(p),
                        "proveedores/archivos.py",
                        getattr(mod_archivos, "transform_azure", None),
                        getattr(mod_archivos, "transform_items", None),
                        getattr(mod_archivos, "should_full_handoff_custom", None),
                    )
            except Exception as e:
                print(f"    [proveedores/archivos.py] error in get_prompt_for_filename: {e}")
    except ModuleNotFoundError:
        pass
    except Exception as e:
        print(f"    [proveedores/archivos.py] error importing module: {e}")

    # 2) Try individual supplier plugins
    try:
        pkg = importlib.import_module("proveedores")
        for _, mod_name, is_pkg in pkgutil.iter_modules(pkg.__path__):
            if is_pkg or mod_name in ("archivos", "__init__"):
                continue
            try:
                full_name = f"proveedores.{mod_name}"
                mod = importlib.import_module(full_name)
                patterns = getattr(mod, "PATTERNS", None)
                prompt = getattr(mod, "PROMPT", None)
                if prompt is None:
                    prompt = ""
                if patterns and isinstance(patterns, (list, tuple)):
                    for pat in patterns:
                        try:
                            if isinstance(pat, str):
                                if re.search(pat, filename, flags=re.I):
                                    return (
                                        str(prompt),
                                        f"{full_name}.py",
                                        getattr(mod, "transform_azure", None),
                                        getattr(mod, "transform_items", None),
                                        getattr(mod, "should_full_handoff_custom", None),
                                    )
                            elif hasattr(pat, "search"):
                                if pat.search(filename):
                                    return (
                                        str(prompt),
                                        f"{full_name}.py",
                                        getattr(mod, "transform_azure", None),
                                        getattr(mod, "transform_items", None),
                                        getattr(mod, "should_full_handoff_custom", None),
                                    )
                        except Exception:
                            continue
            except Exception as e:
                print(f"    [proveedores plugin] error importing {mod_name}: {e}")
    except Exception as e:
        print(f"    [proveedores] error scanning package: {e}")

    return "", None, None, None, None
