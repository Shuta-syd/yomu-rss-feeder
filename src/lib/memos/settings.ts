import {rawDb} from '../db';
import {encrypt,decrypt} from '../crypto';
import {MemosClient,MemosError} from './client';
import {connectionId,normalizeOrigin} from './content';
const KEY='memos_integration';
interface Config {origin:string;token:string;user:string;displayName:string}
export function readMemosConfig():Config|null {const row=rawDb.prepare('SELECT value FROM app_config WHERE key=?').get(KEY) as {value:string}|undefined;return row?JSON.parse(row.value):null;}
export function publicMemosConfig() {const c=readMemosConfig();return c?{origin:c.origin,user:c.user,displayName:c.displayName,configured:true,connectionId:connectionId(c.origin,c.user)}:{origin:'https://memos.my-house.tokyo',configured:false};}
export function memosConnection() {const c=readMemosConfig();if(!c)throw new MemosError(400,'設定の「連携」からMemosを接続してください。');return {...c,client:new MemosClient(c.origin,decrypt(c.token)),connectionId:connectionId(c.origin,c.user)};}
export async function saveMemosConfig(originInput:string,tokenInput?:string) {
 let origin:string;try {origin=normalizeOrigin(originInput);}catch{throw new MemosError(400,'HTTPSのMemosルートURLを入力してください。');}
 const old=readMemosConfig();
 // A saved token must never be forwarded to a newly entered origin.
 const token=tokenInput?.trim() || (old?.origin===origin?decrypt(old.token):'');
 if(!token)throw new MemosError(400,'Memosのアクセストークンを入力してください。');
 const user=await new MemosClient(origin,token).me();
 rawDb.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(KEY,JSON.stringify({origin,token:encrypt(token),user:user.name,displayName:user.displayName}));
 return publicMemosConfig();
}
export function disconnectMemos() {rawDb.prepare('DELETE FROM app_config WHERE key=?').run(KEY);}
