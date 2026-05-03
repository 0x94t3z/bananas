from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/images/banana-hero.png"
BANANA = ROOT / "public/images/bananas.png"
FONT_400 = ROOT / "assets/fonts/pixelify-sans-400.ttf"
FONT_600 = ROOT / "assets/fonts/pixelify-sans-600.ttf"

W = 1024
H = 1024
PURPLE = (93, 71, 154)
WHITE = (245, 254, 255)


def draw_centered(draw: ImageDraw.ImageDraw, text: str, y: int, font: ImageFont.FreeTypeFont, spacing: int = 0) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    x = (W - text_w) // 2
    draw.text((x, y), text, font=font, fill=WHITE, spacing=spacing)


def draw_up_arrow(draw: ImageDraw.ImageDraw, x: int, y: int, scale: int) -> None:
    pixels = [
        "00100",
        "01110",
        "10101",
        "00100",
        "00100",
        "00100",
        "00100",
    ]
    for row, line in enumerate(pixels):
        for col, value in enumerate(line):
            if value == "1":
                draw.rectangle(
                    [
                        x + col * scale,
                        y + row * scale,
                        x + (col + 1) * scale - 1,
                        y + (row + 1) * scale - 1,
                    ],
                    fill=WHITE,
                )


def draw_tap_with_arrow(draw: ImageDraw.ImageDraw, y: int, font: ImageFont.FreeTypeFont) -> None:
    text = "TAP"
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    arrow_scale = 10
    arrow_w = 5 * arrow_scale
    gap = 64
    total_w = text_w + gap + arrow_w
    text_x = (W - total_w) // 2
    arrow_x = text_x + text_w + gap
    draw.text((text_x, y), text, font=font, fill=WHITE)
    draw_up_arrow(draw, arrow_x, y + 16, arrow_scale)


def main() -> None:
    canvas = Image.new("RGBA", (W, H), (*PURPLE, 255))
    draw = ImageDraw.Draw(canvas)

    title_font = ImageFont.truetype(str(FONT_600), 82)
    tap_font = ImageFont.truetype(str(FONT_600), 82)
    credit_font = ImageFont.truetype(str(FONT_600), 38)

    banana = Image.open(BANANA).convert("RGBA")
    banana.thumbnail((520, 360), Image.Resampling.NEAREST)
    banana_x = (W - banana.width) // 2
    banana_y = 265

    draw_centered(draw, "BANANA", 145, title_font)
    canvas.alpha_composite(banana, (banana_x, banana_y))
    draw_tap_with_arrow(draw, 720, tap_font)
    draw_centered(draw, "Snap by @0x94t3z.eth", 875, credit_font)

    canvas.convert("RGB").save(OUT)


if __name__ == "__main__":
    main()
