#!/usr/bin/env node
/**
 * Preflight de procedencia de modelos 3D. API pública oficial Sketchfab.
 * NO descarga modelos, NO necesita sesión, NO instala ningún GLB.
 * Fuente: https://sketchfab.com/developers/download-api
 *
 * node tools/audit-sketchfab-sources.mjs
 * node tools/audit-sketchfab-sources.mjs --strict
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "replacements/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const strict = process.argv.includes("--strict");
const delay = ms => new Promise(res => setTimeout(res, ms));
const records = [];
const allowed = new Set(["by", "cc0"]);  // BY-SA requiere revisión manual adicional.

async function check(car) {
  const report = {
    id: car.id, modelUid: car.sketchfabUid ?? null, title: car.displayName,
    declaredLicense: car.license, rightsReviewed: car.rightsReviewed,
    sourceVerified:false, licenseAllowed:false, downloadable:false
  };
  if (!car.sketchfabUid) {
    report.status = "SIN_UID"; report.reason = "Fuente pública alternativa: inspección manual de titularidad";
    return report;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.sketchfab.com/v3/models/' + encodeURIComponent(car.sketchfabUid), {
        headers:{"Accept":"application/json","User-Agent":"HorizonElSalvador-AttributionAudit/1.0"},
        signal:AbortSignal.timeout(18000)
      });
      if (res.status === 429 || res.status >= 500) { await delay(1200*attempt); continue; }
      if (!res.ok) {
        report.status="HTTP_"+res.status; report.reason="Ficha no verificable desde API pública";
        return report;
      }
      const data = await res.json();
      const licenseUid = String(data.license?.uid ?? "").toLowerCase();
      const licenseLabel = String(data.license?.label ?? data.license?.name ?? "UNVERIFIED");
      report.title = data.name ?? report.title;
      report.owner = data.user?.displayName ?? data.user?.username ?? null;
      report.licenseUid = licenseUid;
      report.licenseLabel = licenseLabel;
      report.modelUrl = data.viewerUrl ?? car.original;
      report.faceCount = data.faceCount ?? null;
      report.downloadable = data.isDownloadable === true;
      report.sourceVerified = true;
      report.licenseAllowed = allowed.has(licenseUid);
      report.status = !report.downloadable ? "NO_DESCARGABLE" :
        !report.licenseAllowed ? "LICENCIA_RESTRINGIDA_O_NO_CONFIRMADA" :
        "LICENCIA_PUBLICADA_COMPATIBLE_PENDIENTE_AUTORIA";
      return report;
    } catch (err) {
      report.status="ERROR_API"; report.reason=String(err);
      await delay(350*attempt);
    }
  }
  return report;
}

for (const car of manifest.cars) {
  const result = await check(car);
  records.push(result);
  console.log(JSON.stringify(result));
}
const file = resolve(root,"replacements/reports/sketchfab-license-audit.json");
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,JSON.stringify({
  auditedAt:new Date().toISOString(),
  disclaimer:"La licencia publicada NO demuestra autoría ni derechos sobre modelos extraídos de otros juegos; revisión humana obligatoria",
  records
},null,2)+"\n");
const blocked = records.filter(r=>!r.sourceVerified||!r.licenseAllowed||!r.downloadable);
console.log("Verificación de fichas:",records.length-blocked.length,"de",records.length,
  "compatibles preliminarmente; bloqueados/no verificados:",blocked.length);
if (strict && (blocked.length>0||records.some(r=>r.rightsReviewed!==true))) {
  console.error("BLOQUEADA LA IMPORTACIÓN COMERCIAL: licencia, procedencia o descarga oficial no aprobada.");
  process.exitCode=1;
}
