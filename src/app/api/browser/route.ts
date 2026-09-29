import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/api-helpers';
import {browserStatus} from '@/lib/browser/connection';
export async function GET(){return withAuth(async()=>NextResponse.json(await browserStatus()));}
