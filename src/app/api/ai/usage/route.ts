import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError } from '@/lib/api-helpers';
import { getUsageReport, saveBudget } from '@/lib/llm/usage';
const schema=z.object({dailyYen:z.number().finite().min(0).max(1000000),monthlyYen:z.number().finite().min(0).max(10000000),yenPerUsd:z.number().finite().min(1).max(1000),rates:z.record(z.string().min(1).max(100),z.object({input:z.number().finite().positive().max(1000),output:z.number().finite().positive().max(10000)})).optional()});
export async function GET(){return withAuth(async()=>NextResponse.json(getUsageReport()));}
export async function PUT(req:NextRequest){return withAuth(async()=>{const p=schema.safeParse(await req.json().catch(()=>null));if(!p.success)return jsonError(400,'予算・換算レート・単価を確認してください。');saveBudget(p.data);return NextResponse.json(getUsageReport());});}
