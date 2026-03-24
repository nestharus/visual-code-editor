from pathlib import Path


def load_asset_text(filename: str) -> str:
    return Path(__file__).with_name(filename).read_text(encoding="utf-8")
