import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-helpers';
import { rawDb } from '@/lib/db';
import { getSettings } from '@/lib/settings';

/** Queue a small explicit retry; the existing worker enforces the AI budget. */
export async function POST() {
  return withAuth(async () => {
    const settings=getSettings();
    const hasKey={gemini:settings.hasGeminiApiKey,openai:settings.hasOpenaiApiKey,anthropic:settings.hasAnthropicApiKey}[settings.stage1Provider];
    if(!hasKey)return NextResponse.json({error:'先にAI設定で使用するプロバイダのAPIキーを登録してください。'},{status:400});
    const result=rawDb.transaction(()=>{
      const pending=rawDb.prepare("SELECT 1 FROM articles WHERE ai_stage1_status='pending' LIMIT 1").get();
      if(pending)return null;
      return rawDb.prepare(`UPDATE articles SET ai_stage1_status='pending',ai_stage1_error=NULL
        WHERE id IN (SELECT id FROM articles WHERE ai_stage1_status='failed' ORDER BY ai_stage1_processed_at,id LIMIT 10)
        AND ai_stage1_status='failed'`).run().changes;
    }).immediate();
    if(result===null)return NextResponse.json({error:'待機中の記事があります。処理が進んでから再試行してください。'},{status:409});
    return NextResponse.json({queued:result});
  });
}
