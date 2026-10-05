import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseHash, routeToHash } from '../src/lib/route.ts';

/**
 * 路由是「链接能发给别人」的地基：hash 写错了，别人点开就是白屏或错页。
 * 所以 parse 与 routeToHash 必须互为逆运算，且 v1 的老链接一条都不能断。
 */

describe('hash 路由：v2 新增视图', () => {
  it('裸 #/ 落到 PM 首页', () => {
    assert.deepEqual(parseHash('#/'), { view: 'home' });
    assert.deepEqual(parseHash(''), { view: 'home' });
    assert.deepEqual(parseHash('#'), { view: 'home' });
  });

  it('必修地图', () => {
    assert.deepEqual(parseHash('#/map'), { view: 'map' });
    assert.equal(routeToHash({ view: 'map' }), '#/map');
  });

  it('案例列表与详情互为逆运算', () => {
    assert.deepEqual(parseHash('#/cases'), { view: 'cases', caseId: null });
    assert.deepEqual(parseHash('#/c/ecommerce-cs-refund-policy'), {
      view: 'cases',
      caseId: 'ecommerce-cs-refund-policy',
    });
    assert.equal(routeToHash({ view: 'cases', caseId: null }), '#/cases');
    assert.equal(
      routeToHash({ view: 'cases', caseId: 'ecommerce-cs-refund-policy' }),
      '#/c/ecommerce-cs-refund-policy',
    );
  });

  it('面试题列表与详情互为逆运算', () => {
    assert.deepEqual(parseHash('#/interview'), { view: 'interview', questionId: null });
    assert.deepEqual(parseHash('#/q/why-llm-hallucinates'), {
      view: 'interview',
      questionId: 'why-llm-hallucinates',
    });
    assert.equal(routeToHash({ view: 'interview', questionId: null }), '#/interview');
    assert.equal(
      routeToHash({ view: 'interview', questionId: 'why-llm-hallucinates' }),
      '#/q/why-llm-hallucinates',
    );
  });

  it('id 里的特殊字符会被编码', () => {
    const tricky = 'a/b c';
    const hash = routeToHash({ view: 'cases', caseId: tricky });
    assert.equal(parseHash(hash).caseId, tricky);
  });
});

describe('hash 路由：v1 老链接零回归', () => {
  it('图谱视图有了显式路由，节点卡片链接原样可用', () => {
    assert.deepEqual(parseHash('#/graph'), { view: 'graph', nodeId: null });
    assert.deepEqual(parseHash('#/n/rag'), { view: 'graph', nodeId: 'rag' });
    assert.equal(routeToHash({ view: 'graph', nodeId: 'rag' }), '#/n/rag');
    assert.equal(routeToHash({ view: 'graph', nodeId: null }), '#/graph');
  });

  it('路径视图不变', () => {
    assert.deepEqual(parseHash('#/paths'), { view: 'paths', pathId: null });
    assert.deepEqual(parseHash('#/p/llm-app-developer'), {
      view: 'paths',
      pathId: 'llm-app-developer',
    });
    assert.equal(routeToHash({ view: 'paths', pathId: 'llm-app-developer' }), '#/p/llm-app-developer');
  });
});
