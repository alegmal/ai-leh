"""Build Chrome Web Store screenshots from a popup capture.
Places the popup on a 1280x800 branded canvas — no upscaling/distortion.
"""
from PIL import Image, ImageDraw, ImageFont
import os, glob

CANVAS = (1280, 800)
BG     = (10, 102, 194)        # LinkedIn blue
WHITE  = (255, 255, 255)
DIM    = (220, 235, 255)
FONT   = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'
FONT_R = '/usr/share/fonts/truetype/freefont/FreeSans.ttf'

# Pick the latest screenshot
candidates = sorted(glob.glob('/projects/screens/screenshot-*.png'), reverse=True)
if not candidates:
    raise SystemExit('No screenshot found in /projects/screens/')
src_path = candidates[0]
print('Using popup screenshot:', src_path)

popup = Image.open(src_path).convert('RGBA')

# Subtle drop shadow under the popup
def with_shadow(img, blur=20, offset=(0, 8), opacity=120):
    from PIL import ImageFilter
    shadow = Image.new('RGBA', (img.size[0] + blur * 4, img.size[1] + blur * 4), (0, 0, 0, 0))
    base = Image.new('RGBA', img.size, (0, 0, 0, opacity))
    shadow.paste(base, (blur * 2 + offset[0], blur * 2 + offset[1]))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    return shadow

os.makedirs('store-assets', exist_ok=True)

def make_canvas(title, subtitle, out_name):
    canvas = Image.new('RGB', CANVAS, BG)
    d = ImageDraw.Draw(canvas)

    title_font = ImageFont.truetype(FONT, 56)
    sub_font   = ImageFont.truetype(FONT_R, 28)

    # Title centered horizontally, ~80px from top
    bb = d.textbbox((0, 0), title, font=title_font)
    tw = bb[2] - bb[0]
    d.text(((CANVAS[0] - tw) / 2 - bb[0], 80 - bb[1]), title, font=title_font, fill=WHITE)

    # Subtitle
    bb2 = d.textbbox((0, 0), subtitle, font=sub_font)
    sw = bb2[2] - bb2[0]
    d.text(((CANVAS[0] - sw) / 2 - bb2[0], 160 - bb2[1]), subtitle, font=sub_font, fill=DIM)

    # Place popup near vertical center, slightly below the title block
    pop = popup
    target_h = 560
    if pop.height > target_h:
        ratio = target_h / pop.height
        pop = pop.resize((int(pop.width * ratio), target_h), Image.LANCZOS)

    px = (CANVAS[0] - pop.width) // 2
    py = 220

    shadow = with_shadow(pop)
    canvas.paste(shadow, (px - shadow.width // 2 + pop.width // 2, py - shadow.height // 2 + pop.height // 2),
                 shadow)
    canvas.paste(pop, (px, py), pop)

    out = f'store-assets/{out_name}'
    canvas.save(out, 'PNG', optimize=True)
    print('Wrote', out, canvas.size)

make_canvas(
    'AI Leh',
    'Hide AI / agent posts from your LinkedIn feed',
    'screenshot-1-popup.png',
)
make_canvas(
    'Customizable keywords',
    'English + Hebrew, whole-word matching, live re-scan',
    'screenshot-2-keywords.png',
)
make_canvas(
    'Per-keyword statistics',
    'Session counts and lifetime totals — see what AI sludge you\'re skipping',
    'screenshot-3-stats.png',
)
print('Done.')
