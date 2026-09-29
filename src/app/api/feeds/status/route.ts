import {NextResponse} from 'next/server';
import {withAuth} from '@/lib/api-helpers';
import {db} from '@/lib/db';
import {feeds} from '@/lib/db/schema';
import {feedFailureMessage} from '@/lib/update-status';
export async function GET(){return withAuth(async()=>{
 // This endpoint does not scan article bodies or aggregate unread counts.
 const rows=db.select({id:feeds.id,title:feeds.title,category:feeds.category,lastFetchedAt:feeds.lastFetchedAt,lastFetchStatus:feeds.lastFetchStatus,lastFetchError:feeds.lastFetchError,consecutiveFetchFailures:feeds.consecutiveFetchFailures}).from(feeds).all();
 return NextResponse.json({feeds:rows.map(f=>({...f,lastFetchError:f.lastFetchStatus==='error'?feedFailureMessage(f.lastFetchError):null}))});
});}
