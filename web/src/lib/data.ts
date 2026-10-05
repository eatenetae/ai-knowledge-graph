import type {
  CasesJson,
  ContentJson,
  GraphJson,
  InterviewJson,
  PathsJson,
  SiteData,
} from '../types';

/**
 * 五个产物都由构建期生成，放在 public/ 下随静态站点一起发布。
 * 用相对路径取，站点部署在子路径（例如 GitHub Pages 的项目页）也能跑。
 */
const ARTIFACTS = [
  'graph.json',
  'paths.json',
  'content.json',
  'cases.json',
  'interview.json',
] as const;

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

async function fetchJson<T>(name: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(name, document.baseURI), { cache: 'no-cache' });
  } catch {
    throw new DataError(`取不到 ${name}：网络请求失败。`);
  }
  if (!response.ok) {
    throw new DataError(`取不到 ${name}：服务端返回 ${response.status}。`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new DataError(`${name} 不是合法的 JSON。`);
  }
}

/**
 * 缺产物是全新克隆后最容易踩的坑（产物不入库），所以把「跑一次构建」写进报错里。
 */
export async function loadSiteData(): Promise<SiteData> {
  let graph: GraphJson;
  let paths: PathsJson;
  let content: ContentJson;
  let cases: CasesJson;
  let interview: InterviewJson;

  try {
    [graph, paths, content, cases, interview] = await Promise.all([
      fetchJson<GraphJson>('graph.json'),
      fetchJson<PathsJson>('paths.json'),
      fetchJson<ContentJson>('content.json'),
      fetchJson<CasesJson>('cases.json'),
      fetchJson<InterviewJson>('interview.json'),
    ]);
  } catch (error) {
    if (error instanceof DataError) {
      throw new DataError(
        `${error.message}\n这些文件是构建产物、不入库。在仓库根目录跑一次 \`node build/index.js\` 就有了。`,
      );
    }
    throw error;
  }

  if (!Array.isArray(graph?.nodes) || graph.nodes.length === 0) {
    throw new DataError('graph.json 里没有任何节点，产物可能是坏的。重新跑一次 `node build/index.js`。');
  }
  if (!Array.isArray(paths?.paths)) {
    throw new DataError('paths.json 的结构不对，重新跑一次 `node build/index.js`。');
  }
  if (!content?.nodes || typeof content.nodes !== 'object') {
    throw new DataError('content.json 的结构不对，重新跑一次 `node build/index.js`。');
  }
  if (!Array.isArray(cases?.cases)) {
    throw new DataError('cases.json 的结构不对，重新跑一次 `node build/index.js`。');
  }
  if (!Array.isArray(interview?.questions)) {
    throw new DataError('interview.json 的结构不对，重新跑一次 `node build/index.js`。');
  }

  return { graph, paths, content, cases, interview };
}

export { ARTIFACTS };
