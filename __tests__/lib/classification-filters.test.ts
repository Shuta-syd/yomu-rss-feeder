import {describe,it,expect} from 'vitest';
import {buildArticlesParams} from '@/lib/articles-params';
import {parseFeedsUrl,buildFeedsUrl} from '@/lib/feeds-url-state';
describe('combined classification filters',()=>{
 it('sends all selected axes to the API',()=>{
  expect(buildArticlesParams({classifications:['業界:食品・農業','テーマ:AI']}).getAll('classification')).toEqual(['業界:食品・農業','テーマ:AI']);
 });
 it('restores and preserves combined axes with other reading conditions',()=>{
  const state=parseFeedsUrl('?classification='+encodeURIComponent('業界:食品・農業')+'&classification='+encodeURIComponent('テーマ:AI')+'&filter=unread&q=ロボット');
  expect(state.classifications).toEqual(['業界:食品・農業','テーマ:AI']);
  expect(parseFeedsUrl(buildFeedsUrl(state))).toEqual(state);
 });
});
