import { assertSafeHttpUrl } from "../url-safety";
import { readResponseArrayBufferLimited } from "../http/read-limited";
export class MemosError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface Memo { name: string; content: string; creator: string; visibility: string; updateTime?: string }
export class MemosClient {
  constructor(private origin: string, private token: string, private request = fetch) {}
  private async call(path: string, method = "GET", body?: unknown): Promise<unknown> {
    try {
      const url = this.origin + path;
      await assertSafeHttpUrl(url);
      const res = await this.request(url, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!res.ok) {
        const status = [401,403,404,409,429].includes(res.status) ? res.status : 502;
        throw new MemosError(status, ({401:"Memosのトークンが無効または期限切れです。設定で確認してください。",403:"このメモを操作する権限がありません。",404:"Memosにメモが見つかりません。",409:"メモは既に存在します。最新の内容を読み込んでください。",429:"Memosへのアクセスが多すぎます。しばらく待って再試行してください。"} as Record<number,string>)[status] ?? "Memosが応答できませんでした。再試行してください。");
      }
      return JSON.parse(Buffer.from(await readResponseArrayBufferLimited(res, 1024 * 1024)).toString("utf8"));
    } catch (error) {
      if (error instanceof MemosError) throw error;
      throw new MemosError(502, "Memosに接続できませんでした。接続先と通信状態を確認してください。");
    }
  }
  async me() {
    const data = await this.call('/api/v1/auth/me') as {user?:{name?:string;displayName?:string}};
    if (!data?.user?.name || !/^users\/[^/\s]+$/.test(data.user.name)) throw new MemosError(502,"Memosのアカウントを確認できませんでした。");
    return {name:data.user.name, displayName:data.user.displayName || data.user.name};
  }
  private validate(data: unknown, id: string): Memo {
    const memo=data as Memo;
    if (!memo || memo.name!==`memos/${id}` || typeof memo.content!=="string" || typeof memo.creator!=="string") throw new MemosError(502,"Memosの応答を確認できませんでした。");
    return memo;
  }
  async memo(id:string) { return this.validate(await this.call(`/api/v1/memos/${encodeURIComponent(id)}`),id); }
  async create(id:string,content:string) { return this.validate(await this.call(`/api/v1/memos?memoId=${encodeURIComponent(id)}`,"POST",{content,visibility:"PRIVATE",state:"NORMAL"}),id); }
  async update(id:string,content:string) { return this.validate(await this.call(`/api/v1/memos/${encodeURIComponent(id)}?updateMask=content`,"PATCH",{content}),id); }
}
