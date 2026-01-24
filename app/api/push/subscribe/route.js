import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Lazy initialization - skapas först vid första anrop
let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('Supabase environment variables not configured');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export async function POST(request) {
  try {
    const db = getSupabase();
    const { userId, customerId, subscription } = await request.json();

    if (!userId || !subscription) {
      return NextResponse.json(
        { error: 'userId and subscription required' },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        customer_id: customerId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,endpoint'
      });

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const db = getSupabase();
    const { userId, endpoint } = await request.json();

    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
