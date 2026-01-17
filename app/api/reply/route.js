import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { sessionId, message } = await request.json()

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'sessionId och message kravs' },
        { status: 400 }
      )
    }

    // Skapa Supabase-klient med anvandarens session
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )

    // Verifiera att anvandaren ar inloggad
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
    }

    // Anvand admin client for att bypassa RLS
    const { createClient } = require('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Hamta session for att fa gastinfo OCH customer-info
    const { data: session, error: sessionError } = await adminClient
      .from('chat_sessions')
      .select('*, customers(*)')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 })
    }

    // Spara personalens meddelande
    const { data: newMessage, error: messageError } = await adminClient
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: message,
        sender_type: 'human'
      })
      .select()
      .single()

    if (messageError) {
      console.error('Failed to save message:', messageError)
      return NextResponse.json({ error: 'Kunde inte spara meddelande' }, { status: 500 })
    }

    // Uppdatera session
    await adminClient
      .from('chat_sessions')
      .update({ 
        updated_at: new Date().toISOString(),
        needs_human: false 
      })
      .eq('id', sessionId)

    // Uppdatera notification till handled om den finns
    await adminClient
      .from('notifications')
      .update({ status: 'handled' })
      .eq('session_id', sessionId)

    // Skicka email till gasten om vi har deras email
    const guestEmail = session.metadata?.guest_email
    const customerSlug = session.customers?.slug || 'bella-italia'
    const customerName = session.customers?.name || 'Bella Italia'
    
    if (guestEmail) {
      await sendGuestReplyEmail(guestEmail, {
        guestName: session.metadata?.guest_name || 'Gast',
        message: message,
        sessionId: sessionId,
        customerSlug: customerSlug,
        customerName: customerName
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: newMessage,
      emailSent: !!guestEmail
    })

  } catch (error) {
    console.error('Reply API error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

// Skicka email till gasten nar personal svarar
async function sendGuestReplyEmail(guestEmail, data) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping guest reply email')
    return
  }

  // Bygg direktlank till chatten
  const chatUrl = `https://${data.customerSlug}.eryai.tech?chat=open`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${data.customerName} <sofia@eryai.tech>`,
        to: guestEmail,
        reply_to: 'info@bellaitalia.se',
        subject: `Svar fran ${data.customerName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Georgia', serif; line-height: 1.8; color: #2d3e2f; margin: 0; padding: 0; background: #faf8f5; }
              .container { max-width: 500px; margin: 0 auto; padding: 20px; }
              .header { text-align: center; padding: 30px 20px; }
              .header h1 { color: #2d3e2f; margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
              .message-box { background: #f0fdf4; border-left: 4px solid #2d3e2f; padding: 20px; margin: 20px 0; }
              .message { font-size: 16px; }
              .cta-button { 
                display: inline-block; 
                background: #d4a574; 
                color: #1c1c1c !important; 
                padding: 16px 32px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600; 
                margin-top: 20px;
                text-align: center;
              }
              .cta-container { text-align: center; margin-top: 24px; }
              .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
              .note { font-size: 13px; color: #888; margin-top: 16px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>${data.customerName}</h1>
              </div>
              <div class="content">
                <p class="message">Hej ${data.guestName}!</p>
                <p class="message">Vi har svarat pa ditt meddelande:</p>
                
                <div class="message-box">
                  <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
                </div>

                <div class="cta-container">
                  <a href="${chatUrl}" class="cta-button">
                    Oppna chatten for att svara
                  </a>
                </div>

                <p class="note">
                  Du kan aven ringa oss pa <strong>08-555 1234</strong> om du har fragor.
                </p>
                
                <p class="message" style="margin-top: 24px;">Varma halsningar,<br><em>Teamet pa ${data.customerName}</em></p>
              </div>
              <div class="footer">
                ${data.customerName} - Strandvagen 42, Stockholm - 08-555 1234<br>
                <small>Detta mail skickades via EryAI.tech</small>
              </div>
            </div>
          </body>
          </html>
        `
      })
    })

    const result = await response.json()
    if (response.ok) {
      console.log('Guest reply email sent:', result.id)
    } else {
      console.error('Resend error:', result)
    }
  } catch (error) {
    console.error('Failed to send guest reply email:', error)
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
