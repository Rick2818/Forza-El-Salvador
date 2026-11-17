"""Run with system Python: python tools/blender/review-selected.py.

Requires Blender on PATH. Regenerates 42 views and their summary. Pillow is
optional and is used only for the contact sheet, never for source photographs.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--blender', default='blender')
    args = parser.parse_args()
    designs = json.loads((ROOT/'src/vehicle/vehicle-designs.json').read_text())
    reports = []
    for d in designs:
        ident = d['id']
        folder = ROOT/'review/selected'/ident
        folder.mkdir(parents=True, exist_ok=True)
        with (folder/'render.log').open('w') as log:
            subprocess.run([args.blender, '--background', '--threads', '2', '--python',
                'tools/blender/review-vehicle.py', '--', '--asset',
                f'public/models/selected/{ident}.glb', '--out-dir', f'review/selected/{ident}',
                '--full-vehicle', '--design', ident], cwd=ROOT, stdout=log, stderr=log, check=True)
        reports.append(json.loads((folder/'geometry-report.json').read_text()))
        print('REVIEWED', ident, flush=True)
    summary = dict(status='PROTOTYPES_REVIEW_REQUIRED', productionApproved=False,
        fps60Verified=False, visualFidelityApproved=False, vehicles=reports)
    (ROOT/'review/selected/summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print('42 views and JSON complete; install Pillow to generate the contact sheet.')
        return
    names = ['Ferrari California T', 'Yangwang U9', 'Koenigsegg Jesko Odin',
        'Bugatti Chiron', 'Porsche 911', 'Lamborghini Aventador Roadster',
        'Mercedes-AMG GT Black Series']
    def font(size):
        for name in ['DejaVuSans.ttf', 'arial.ttf']:
            try: return ImageFont.truetype(name, size)
            except OSError: pass
        return ImageFont.load_default(size=size)
    canvas = Image.new('RGB', (1600,1810), '#111923')
    draw = ImageDraw.Draw(canvas)
    draw.text((35,22), 'HORIZON EL SALVADOR | PROTOTIPOS 3D', font=font(24), fill='white')
    draw.text((35,60), 'Primera aproximacion. Fidelidad visual y 60 FPS pendientes de validacion.',
        font=font(18), fill='#f5c477')
    for i,(d,name) in enumerate(zip(designs,names)):
        x=20+(i%2)*790; y=110+(i//2)*420
        image=Image.open(ROOT/'review/selected'/d['id']/'front34.png').convert('RGB')
        image=image.crop((180,170,920,650));image.thumbnail((770,365))
        canvas.paste(image,(x,y));draw.text((x+10,y+365),name,font=font(18),fill='white')
    canvas.save(ROOT/'review/selected/contact-sheet.jpg', quality=90)


if __name__ == '__main__': main()
