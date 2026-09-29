/**
 * 把内存里的图与路径序列化成前端消费的 JSON。
 * 输出必须稳定（同样的内容产出同样的字节），否则每次构建都会产生无意义的 diff。
 */

export const GRAPH_VERSION = 1;

export function toGraphJson({ nodes, edges, domains, generatedAt }) {
  const domainMeta = new Map(domains.map((domain) => [domain.id, domain]));
  const orderOf = (id) => domainMeta.get(id)?.order ?? 999;

  const sortedNodes = [...nodes].sort((a, b) => {
    const byDomain = orderOf(a.data.domain) - orderOf(b.data.domain);
    return byDomain !== 0 ? byDomain : a.id.localeCompare(b.id);
  });

  const counts = new Map();
  for (const node of sortedNodes) {
    counts.set(node.data.domain, (counts.get(node.data.domain) ?? 0) + 1);
  }

  return {
    version: GRAPH_VERSION,
    generated_at: generatedAt,
    // 边的方向：source 是前置，target 是后继（先学 source 才能学 target）
    edge_semantics: 'source -> target 表示「先学 source，才能学 target」',
    domains: domains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      order: domain.order,
      node_count: counts.get(domain.id) ?? 0,
    })),
    nodes: sortedNodes.map((node) => ({
      id: node.id,
      title: node.data.title,
      domain: node.data.domain,
      summary: node.data.summary,
      tags: node.data.tags ?? [],
      prerequisites: node.data.prerequisites ?? [],
      related: node.data.related ?? [],
      sources: node.data.sources ?? [],
      updated_at: node.data.updated_at,
      file: node.file,
    })),
    edges,
    stats: {
      node_count: sortedNodes.length,
      edge_count: edges.length,
      prerequisite_edge_count: edges.filter((edge) => edge.type === 'prerequisite').length,
      related_edge_count: edges.filter((edge) => edge.type === 'related').length,
      domain_count: new Set(sortedNodes.map((node) => node.data.domain)).size,
    },
  };
}

export function toPathsJson({ paths, byId, generatedAt }) {
  const sorted = [...paths].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: GRAPH_VERSION,
    generated_at: generatedAt,
    paths: sorted.map((path) => ({
      id: path.id,
      title: path.data.title,
      summary: path.data.summary,
      audience: path.data.audience,
      updated_at: path.data.updated_at,
      // 步骤里带上 title/domain，路径视图不用再回头查 graph.json
      steps: (path.data.steps ?? []).map((step) => ({
        id: step.id,
        note: step.note ?? null,
        title: byId.get(step.id)?.data.title ?? null,
        domain: byId.get(step.id)?.data.domain ?? null,
      })),
      file: path.file,
    })),
  };
}
