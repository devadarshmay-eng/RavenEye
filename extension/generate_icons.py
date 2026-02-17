#!/usr/bin/env python3
"""Generate RavenEye PNG icons"""
import struct, zlib, base64

def create_png(size, color=(124, 58, 237)):
    """Create a simple purple raven-eye icon as PNG"""
    # Create pixel data
    pixels = []
    cx, cy = size // 2, size // 2
    r = size // 2 - 2
    inner_r = r // 3

    for y in range(size):
        row = []
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5

            # Background: transparent
            alpha = 0
            pr, pg, pb = 0, 0, 0

            # Outer circle (main body)
            if dist <= r:
                # Purple background
                t = max(0, 1 - abs(dist - r * 0.5) / (r * 0.5))
                pr, pg, pb = color
                alpha = 255

                # Rounded square background
                if dist > r:
                    alpha = 0

            # Eye pupil
            if dist <= inner_r:
                pr, pg, pb = 255, 255, 255
                alpha = 255

            row.extend([pr, pg, pb, alpha])
        pixels.append(bytes(row))

    # PNG encoding
    def pack_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    # Wait, RGBA is color type 6
    ihdr_data = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])

    raw = b''
    for row in pixels:
        raw += b'\x00' + row

    compressed = zlib.compress(raw, 9)

    png = b'\x89PNG\r\n\x1a\n'
    png += pack_chunk(b'IHDR', ihdr_data)
    png += pack_chunk(b'IDAT', compressed)
    png += pack_chunk(b'IEND', b'')
    return png

import os
sizes = [16, 32, 48, 128]
icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(icons_dir, exist_ok=True)

for size in sizes:
    png_data = create_png(size)
    with open(os.path.join(icons_dir, f'icon{size}.png'), 'wb') as f:
        f.write(png_data)
    print(f"Created icon{size}.png ({len(png_data)} bytes)")

print("Icons generated!")
