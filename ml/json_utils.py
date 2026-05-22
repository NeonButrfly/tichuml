from __future__ import annotations

import json
import math
from typing import Any


def make_json_safe(value: Any) -> Any:
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [make_json_safe(item) for item in value]
    return value


def dumps_json_safe(value: Any, **kwargs: Any) -> str:
    return json.dumps(make_json_safe(value), allow_nan=False, **kwargs)
