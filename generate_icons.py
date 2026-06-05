from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 32, 48, 128]
PROMO = (440, 280)

BG    = (10, 102, 194)
RED   = (220, 50, 50)
WHITE = (232, 237, 242)
FONT  = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'

os.makedirs('icons', exist_ok=True)

def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
    return mask

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg = Image.new('RGBA', (size, size), BG)
    radius = max(2, size // 5)
    bg.putalpha(rounded_mask(size, radius))
    img.paste(bg, mask=bg.split()[3])
    d = ImageDraw.Draw(img)

    lw = max(1, size // 10)
    margin = max(1, size // 14)

    # Ban circle
    d.ellipse([margin, margin, size - margin, size - margin], outline=RED, width=lw)
    # Slash top-right → bottom-left
    off = margin + lw // 2
    ao = int(size * 0.2)
    d.line([size - off - ao, off, off + ao, size - off], fill=RED, width=lw)

    # "AI" text on top — large enough to dominate
    font_size = max(4, int(size * 0.48))
    font = ImageFont.truetype(FONT, font_size)
    bbox = d.textbbox((0, 0), 'AI', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) / 2 - bbox[0]
    ty = (size - th) / 2 - bbox[1]
    d.text((tx, ty), 'AI', font=font, fill=WHITE)

    return img

for s in SIZES:
    draw_icon(s).save(f'icons/icon{s}.png')
    print(f'icons/icon{s}.png')

# Promo tile 440x280
promo = Image.new('RGBA', PROMO, BG)
d = ImageDraw.Draw(promo)

cx, cy = PROMO[0] // 2, PROMO[1] // 2 - 15
r, lw = 95, 11

# Ban circle
d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=RED, width=lw)
ao = int(r * 0.62)
d.line([cx+ao, cy-r+10, cx-ao, cy+r-10], fill=RED, width=lw)

# "AI" text
font_big = ImageFont.truetype(FONT, 100)
bbox = d.textbbox((0, 0), 'AI', font=font_big)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
d.text((cx - tw/2 - bbox[0], cy - th/2 - bbox[1]), 'AI', font=font_big, fill=WHITE)

# Subtitle
font_sub = ImageFont.truetype(FONT, 22)
sub = 'AI Leh  —  Hide AI posts from LinkedIn'
bbox2 = d.textbbox((0, 0), sub, font=font_sub)
sw = bbox2[2] - bbox2[0]
d.text(((PROMO[0]-sw)/2, cy + r + 18), sub, font=font_sub, fill=(138, 155, 176))

promo.save('icons/promo440x280.png')
print('icons/promo440x280.png')
print('Done.')
