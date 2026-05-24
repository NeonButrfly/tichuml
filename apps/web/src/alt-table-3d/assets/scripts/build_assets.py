from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"
RUNTIME = ROOT / "runtime"

CARD_WIDTH = 420
CARD_HEIGHT = 600
CARD_COLUMNS = 8
CARD_ROWS = 7

SUIT_ORDER = ["jade", "sword", "pagoda", "star"]
RANK_ORDER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
SPECIAL_ORDER = ["mahjong", "dog", "phoenix", "dragon"]

SUIT_COLORS = {
    "jade": "#1d6b50",
    "sword": "#355c83",
    "pagoda": "#9f4730",
    "star": "#5f5130",
}

SUIT_LABELS = {
    "jade": "JADE",
    "sword": "SWORD",
    "pagoda": "PAGODA",
    "star": "STAR",
}

SPECIAL_LABELS = {
    "mahjong": ("1", "Mahjong"),
    "dog": ("DOG", "Dog"),
    "phoenix": ("PHX", "Phoenix"),
    "dragon": ("DRG", "Dragon"),
}


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image.convert("RGBA"), size, method=Image.Resampling.LANCZOS)


def ensure_runtime_dir() -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_candidates = [
        Path("C:/Windows/Fonts") / name,
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
    ]
    for candidate in font_candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


RANK_FONT = load_font("georgiab.ttf", 74)
LABEL_FONT = load_font("georgia.ttf", 34)
TITLE_FONT = load_font("georgia.ttf", 40)
CORNER_LABEL_FONT = load_font("georgiab.ttf", 44)


def paste_resized(source_name: str, target_name: str, size: tuple[int, int]) -> None:
    image = Image.open(GENERATED / source_name)
    fit_cover(image, size).save(RUNTIME / target_name)


def draw_standard_card(template: Image.Image, suit: str, rank: int) -> Image.Image:
    card = fit_cover(template, (CARD_WIDTH, CARD_HEIGHT))
    draw = ImageDraw.Draw(card)
    color = SUIT_COLORS[suit]
    rank_label = str(rank) if rank <= 10 else {11: "J", 12: "Q", 13: "K", 14: "A"}[rank]
    suit_label = SUIT_LABELS[suit]

    draw.rounded_rectangle((120, 196, 300, 404), radius=92, outline=color, width=4, fill="#f7f0dd")
    draw.ellipse((152, 228, 268, 344), outline=color, width=5, fill="#f0e2bf")
    draw.ellipse((182, 258, 238, 314), fill=color)
    draw.arc((144, 220, 276, 352), start=208, end=332, fill="#c7a35f", width=4)
    draw.arc((160, 236, 260, 336), start=20, end=145, fill="#c7a35f", width=4)

    draw.text((34, 24), rank_label, fill=color, font=RANK_FONT)
    draw.text((36, 104), suit_label, fill=color, font=LABEL_FONT)
    draw.text((CARD_WIDTH - 34, CARD_HEIGHT - 96), rank_label, fill=color, font=RANK_FONT, anchor="ra")
    draw.text(
        (CARD_WIDTH - 34, CARD_HEIGHT - 34),
        suit_label,
        fill=color,
        font=LABEL_FONT,
        anchor="rd",
    )

    draw.text((CARD_WIDTH / 2, 364), suit_label, fill=color, font=TITLE_FONT, anchor="mm")
    return card


def draw_special_card(source: Image.Image, special: str) -> Image.Image:
    card = fit_cover(source, (CARD_WIDTH, CARD_HEIGHT))
    draw = ImageDraw.Draw(card)
    corner_label, title = SPECIAL_LABELS[special]
    draw.rounded_rectangle((18, 18, CARD_WIDTH - 18, CARD_HEIGHT - 18), radius=28, outline="#b68c3d", width=4)
    draw.text((30, 26), corner_label, fill="#7c3525", font=CORNER_LABEL_FONT)
    draw.text((CARD_WIDTH / 2, CARD_HEIGHT - 48), title, fill="#6b5330", font=TITLE_FONT, anchor="mm")
    return card


def build_card_atlas() -> None:
    template = Image.open(GENERATED / "card-face-template-source.png")
    special_images = {
        "mahjong": Image.open(GENERATED / "card-mahjong-source.png"),
        "dog": Image.open(GENERATED / "card-dog-source.png"),
        "phoenix": Image.open(GENERATED / "card-phoenix-source.png"),
        "dragon": Image.open(GENERATED / "card-dragon-source.png"),
    }

    atlas = Image.new(
        "RGBA",
        (CARD_COLUMNS * CARD_WIDTH, CARD_ROWS * CARD_HEIGHT),
        (0, 0, 0, 0),
    )
    atlas_index: dict[str, dict[str, int]] = {}
    ordered_ids: list[str] = []

    for suit in SUIT_ORDER:
        for rank in RANK_ORDER:
            ordered_ids.append(f"{suit}-{rank}")
    ordered_ids.extend(SPECIAL_ORDER)

    for index, card_id in enumerate(ordered_ids):
        column = index % CARD_COLUMNS
        row = index // CARD_COLUMNS
        x = column * CARD_WIDTH
        y = row * CARD_HEIGHT

        if card_id in special_images:
            card_image = draw_special_card(special_images[card_id], card_id)
        else:
            suit, rank_token = card_id.split("-")
            card_image = draw_standard_card(template, suit, int(rank_token))

        atlas.alpha_composite(card_image, (x, y))
        atlas_index[card_id] = {
            "index": index,
            "column": column,
            "row": row,
            "x": x,
            "y": y,
            "width": CARD_WIDTH,
            "height": CARD_HEIGHT,
        }

    atlas.save(RUNTIME / "card-front-atlas.png")
    (RUNTIME / "card-front-atlas-index.json").write_text(
        json.dumps(
            {
                "columns": CARD_COLUMNS,
                "rows": CARD_ROWS,
                "cardWidth": CARD_WIDTH,
                "cardHeight": CARD_HEIGHT,
                "cards": atlas_index,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    ensure_runtime_dir()
    paste_resized("walnut-source.png", "walnut-texture.png", (2048, 2048))
    paste_resized("felt-source.png", "felt-texture.png", (2048, 2048))
    paste_resized("tray-material-source.png", "tray-material-texture.png", (2048, 2048))
    paste_resized("plaque-material-source.png", "plaque-material-texture.png", (1024, 1024))
    paste_resized("card-back-source.png", "card-back-texture.png", (CARD_WIDTH, CARD_HEIGHT))
    build_card_atlas()


if __name__ == "__main__":
    main()
