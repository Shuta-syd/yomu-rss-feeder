import {it,expect} from 'vitest';
import {aiPauseReason,feedFailureMessage} from '@/lib/update-status';
it('distinguishes a recorded budget hold from ordinary queued work',()=>{expect(aiPauseReason({pending:8,processing:0,budgetWaiting:0,pricingWaiting:0},true)).toBeNull();expect(aiPauseReason({pending:8,processing:0,budgetWaiting:1,pricingWaiting:0},true)).toBe('budget');});
it('does not claim AI stopped while it is working',()=>{expect(aiPauseReason({pending:8,processing:1,budgetWaiting:1,pricingWaiting:0},true)).toBeNull();});
it('distinguishes missing configuration and clears reasons when the queue is empty',()=>{expect(aiPauseReason({pending:1,processing:0,budgetWaiting:0,pricingWaiting:1},true)).toBe('pricing');expect(aiPauseReason({pending:1,processing:0,budgetWaiting:0,pricingWaiting:0},false)).toBe('api_key');expect(aiPauseReason({pending:0,processing:0,budgetWaiting:0,pricingWaiting:0},false)).toBeNull();});
it('does not expose raw feed URLs or error bodies',()=>{expect(feedFailureMessage('Feed fetch failed: 403 https://example.com/private?token=secret')).toContain('403');expect(feedFailureMessage('https://user:secret@example.com/feed')).not.toContain('secret');});
