// Cloudflare Pages Function — POST /api/lead
// Guarda lead en Airtable y envía correo de notificación

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const {
      email, companyName, painPoint, contactName, jobTitle,
      consent, consentText, consentAt, source, assetId, language, pageUrl
    } = body;

    if (consent !== true) {
      return new Response(JSON.stringify({ ok: false, error: 'CONSENT_REQUIRED' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCompany = String(companyName || '').trim().substring(0, 120);
    const cleanPainPoint = String(painPoint || '').trim().substring(0, 1000);
    const cleanContactName = String(contactName || '').trim().substring(0, 120);
    const cleanJobTitle = String(jobTitle || '').trim().substring(0, 120);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return new Response(JSON.stringify({ ok: false, error: 'Correo electrónico no válido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Guardar en Airtable
    let airtableOk = false;
    const airtableApiKey = env.AIRTABLE_API_KEY;
    const airtableBaseId = env.AIRTABLE_BASE_ID;
    const airtableTableName = env.AIRTABLE_TABLE_NAME || 'Leads';

    if (airtableApiKey && airtableBaseId) {
      try {
        const airtableResp = await fetch(
          `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + airtableApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                'Nombre': cleanContactName || cleanEmail,
                'Correo': cleanEmail,
                'Empresa': cleanCompany,
                'Cargo': cleanJobTitle,
                'Tarea': cleanPainPoint,
                'Activo': assetId,
                'Idioma': language,
                'Fuente': source,
                'Consentimiento': consent,
                'Fecha consentimiento': consentAt,
                'Página': pageUrl,
                'ID solicitud': 'WEB-' + Date.now()
              }
            })
          }
        );
        if (airtableResp.ok) {
          airtableOk = true;
          console.log('[AIRTABLE] Lead guardado correctamente');
        } else {
          console.error('[AIRTABLE] Error ' + airtableResp.status + ' ' + await airtableResp.text());
        }
      } catch (e) {
        console.error('[AIRTABLE] Excepción:', e.message);
      }
    }

    // Enviar correo vía Resend
    const resendApiKey = env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const emailText = [
          'Nueva solicitud de evaluación por escrito',
          '',
          'Nombre: ' + cleanContactName,
          'Correo: ' + cleanEmail,
          'Empresa: ' + cleanCompany,
          'Cargo: ' + cleanJobTitle,
          'Tarea: ' + cleanPainPoint,
          'Activo: ' + assetId,
          'Idioma: ' + language,
          'Página: ' + pageUrl,
          'Consentimiento: ' + consentAt,
          'Airtable: ' + (airtableOk ? 'Guardado' : 'No configurado'),
          'ID: WEB-' + Date.now(),
          '',
          'Responder a: ' + cleanEmail
        ].join('\n');

        const emailHtml = '<!DOCTYPE html><html><body><pre style="font-family:monospace;white-space:pre-wrap;background:#f5f5f5;padding:20px;border-radius:8px">' +
          emailText.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
          '</pre></body></html>';

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + resendApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Boltech Group <onboarding@resend.dev>',
            to: ['ricardo.boltechgroup@gmail.com'],
            subject: 'Nueva solicitud de evaluación - ' + cleanCompany + ' (' + assetId + ')',
            text: emailText,
            html: emailHtml
          })
        });
      } catch (e) {
        console.error('[EMAIL] Error:', e.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      registration: {
        status: 'RECORDED',
        requestId: 'WEB-' + Date.now(),
        contactSyncStatus: airtableOk ? 'AIRTABLE_RECORDED' : 'EMAIL_NOTIFIED'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
