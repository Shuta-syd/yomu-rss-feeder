const KEY='yomu:pending-browser-import';
const MAX_AGE=30*60*1000;
export function rememberBrowserImport(storage:Storage,id:string,now=Date.now()) {
 storage.setItem(KEY,JSON.stringify({id,at:now}));
}
export function pendingBrowserImport(storage:Storage,now=Date.now()):string|null {
 try {
  const value=JSON.parse(storage.getItem(KEY)??'null');
  if(value&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.id)&&typeof value.at==='number'&&now>=value.at&&now-value.at<MAX_AGE)return value.id;
 } catch { /* A corrupt browser value is not a pending operation. */ }
 return null;
}
export function takeBrowserImport(storage:Storage):string|null {
 const id=pendingBrowserImport(storage);storage.removeItem(KEY);return id;
}
