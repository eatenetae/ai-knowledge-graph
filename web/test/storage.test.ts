import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  CASES_READ_KEY,
  LEARNED_KEY,
  MASTERED_KEY,
  loadIdList,
  saveIdList,
  toggleIdInList,
} from '../src/lib/storage.ts';

/**
 * 三个勾选清单共用一套读写。node --test 里没有 localStorage，
 * 这里放一个最小替身，验证「写进去的确实读得回来、坏了不炸」。
 */

const backing = new Map<string, string>();

beforeEach(() => {
  backing.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
  };
});

describe('勾选清单的本地存储', () => {
  it('空的时候读到空数组', () => {
    assert.deepEqual(loadIdList(LEARNED_KEY), []);
  });

  it('写进去的 id 排序后能原样读回', () => {
    saveIdList(LEARNED_KEY, ['rag', 'hallucination', 'attention']);
    assert.deepEqual(loadIdList(LEARNED_KEY), ['attention', 'hallucination', 'rag']);
  });

  it('三个 key 互不串门', () => {
    saveIdList(LEARNED_KEY, ['rag']);
    saveIdList(CASES_READ_KEY, ['ecommerce-cs-refund-policy']);
    saveIdList(MASTERED_KEY, ['why-llm-hallucinates']);
    assert.deepEqual(loadIdList(LEARNED_KEY), ['rag']);
    assert.deepEqual(loadIdList(CASES_READ_KEY), ['ecommerce-cs-refund-policy']);
    assert.deepEqual(loadIdList(MASTERED_KEY), ['why-llm-hallucinates']);
  });

  it('切换：没有就加、有就去掉，结果总是排好序', () => {
    let list = toggleIdInList([], 'rag');
    assert.deepEqual(list, ['rag']);
    list = toggleIdInList(list, 'attention');
    assert.deepEqual(list, ['attention', 'rag']);
    list = toggleIdInList(list, 'rag');
    assert.deepEqual(list, ['attention']);
  });

  it('存进去的值坏了不炸，读回空数组', () => {
    backing.set(MASTERED_KEY, 'not json {{{');
    assert.deepEqual(loadIdList(MASTERED_KEY), []);

    backing.set(MASTERED_KEY, JSON.stringify({ nope: true }));
    assert.deepEqual(loadIdList(MASTERED_KEY), []);

    backing.set(MASTERED_KEY, JSON.stringify([1, 'ok', null]));
    assert.deepEqual(loadIdList(MASTERED_KEY), ['ok']);
  });

  it('localStorage 不可用时静默降级', () => {
    delete (globalThis as Record<string, unknown>).localStorage;
    assert.deepEqual(loadIdList(LEARNED_KEY), []);
    saveIdList(LEARNED_KEY, ['rag']); // 不抛
  });
});
