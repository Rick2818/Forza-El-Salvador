"""Assemble a contact sheet and offline review index from actual studio renders."""
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'review/preart-studio'
manifest=json.loads((OUT/'manifest.json').read_text())
names=['Ferrari California T','Yangwang U9','Koenigsegg Jesko Odin',
    'Bugatti Chiron','Porsche 911','Lamborghini Aventador Roadster',
    'Mercedes-AMG GT Black Series']
assert len(manifest['vehicles'])==len(names), 'All seven renders must complete first'
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,21)
small=ImageFont.truetype(fontpath,17)
sheet=Image.new('RGB',(1600,2210),'#101923')
draw=ImageDraw.Draw(sheet)
draw.text((30,22),'HORIZON EL SALVADOR · PREARTE',font=font,fill='white')
draw.text((30,58),'Geometría real · Estudio Cycles · Modelos en revisión',font=small,fill='#f4c475')
cards=[]
for i,(entry,name) in enumerate(zip(manifest['vehicles'],names)):
    x=20+(i%2)*790;y=110+(i//2)*515
    pic=Image.open(OUT/entry['image']).convert('RGB');pic.thumbnail((770,481))
    sheet.paste(pic,(x,y))
    draw.text((x+8,y+484),name,font=small,fill='white')
    cards.append('<figure><a href="'+entry['image']+'"><img src="'+entry['image']+
        '" alt="'+html.escape(name)+'" loading="lazy"></a><figcaption>'+html.escape(name)+
        '</figcaption></figure>')
sheet.save(OUT/'Horizon_prearte_estudio.jpg',quality=93)
(OUT/'index.html').write_text('''<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Horizon · Prearte</title>
<style>body{margin:24px auto;padding:0 16px;max-width:1500px;background:#101923;color:#fff;font:18px system-ui}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:24px}figure{margin:0}img{width:100%;border-radius:8px}a{color:#f4c475}figcaption{padding:10px 0}p{line-height:1.5;max-width:900px}</style>
<h1>Horizon El Salvador · Prearte</h1><p>Tercer pase de techos, acristalamiento y faros del Ferrari.
Renders de los siete GLB exportados, con iluminación y cámara comunes. Las formas siguen en revisión.</p>
<p><a href="Horizon_prearte_estudio.jpg" download>Descargar lámina conjunta</a></p><main>'''+
    ''.join(cards)+'''</main><p>Pendientes: fidelidad fina, ópticas, interiores, decoración y prueba en navegador.
60 FPS sin verificar. Producción sin cambios.</p></html>''',encoding='utf-8')
