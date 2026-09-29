/**
 * 一个够用的 JSON Schema 校验器（draft 2020-12 的子集）。
 *
 * 之所以不用 ajv：本项目对校验器的唯一硬要求是「错误信息必须指明文件路径 + 具体字段 +
 * 为什么错」。ajv 的默认报错是英文的 `must be string`，要变成人话还是得自己映射一遍，
 * 那不如直接按 schema 里的 `x-error` 自己走一遍，顺便把零依赖保持住。
 *
 * 支持的关键字：type / required / properties / additionalProperties / enum /
 * pattern / minLength / maxLength / minItems / maxItems / uniqueItems / items /
 * format(date) / minimum / maximum。
 * schema 里的 `x-error` 会覆盖默认文案，让 schema 自己成为「怎么写才对」的唯一出处。
 */

const TYPE_NAMES = {
  object: '对象',
  array: '数组',
  string: '字符串',
  number: '数字',
  integer: '整数',
  boolean: '布尔值',
  null: '空值',
};

/**
 * @returns {{path: string, message: string}[]} 空数组表示通过
 */
export function validateAgainstSchema(data, schema) {
  const problems = [];
  walk(data, schema, '', problems);
  return problems;
}

function walk(value, schema, path, problems) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    // 这里刻意不用 x-error：字段级的 x-error 通常是在讲别的约束
    // （比如 tags 的「最多 10 个」），拿它解释类型错误只会把人带偏。
    problems.push({
      path,
      message: `类型应为${formatTypes(schema.type)}，实际是${typeName(value)}`,
    });
    return; // 类型都不对，后面的关键字没有意义
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    problems.push({
      path,
      message: `${schema['x-error'] ?? '值不在允许范围内'}：收到 ${JSON.stringify(value)}`,
      hint: `可选值：${schema.enum.join('、')}`,
    });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push({
        path,
        message: `至少 ${schema.minLength} 个字符，当前 ${value.length} 个`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      problems.push({
        path,
        message: `最多 ${schema.maxLength} 个字符，当前 ${value.length} 个`,
      });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      problems.push({
        path,
        message: `${schema['x-error'] ?? `不符合格式要求 ${schema.pattern}`}：收到 ${JSON.stringify(value)}`,
      });
    }
    if (schema.format === 'date' && !isIsoDate(value)) {
      problems.push({
        path,
        message: `${schema['x-error'] ?? '格式应为 YYYY-MM-DD'}：收到 ${JSON.stringify(value)}`,
      });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      problems.push({ path, message: `不能小于 ${schema.minimum}，当前 ${value}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      problems.push({ path, message: `不能大于 ${schema.maximum}，当前 ${value}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push({
        path,
        message: `至少需要 ${schema.minItems} 项，当前 ${value.length} 项`,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      problems.push({
        path,
        message: `${schema['x-error'] ?? `最多 ${schema.maxItems} 项`}：当前 ${value.length} 项`,
      });
    }
    if (schema.uniqueItems === true) {
      const seen = new Map();
      value.forEach((item, index) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          problems.push({
            path: `${path}[${index}]`,
            message: `重复项 ${JSON.stringify(item)}，和 ${path}[${seen.get(key)}] 一模一样`,
          });
        } else {
          seen.set(key, index);
        }
      });
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        walk(item, schema.items, `${path}[${index}]`, problems);
      });
    }
  }

  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        problems.push({
          path: path === '' ? key : `${path}.${key}`,
          message: `缺少必填字段 \`${key}\``,
          hint: schema.properties?.[key]?.description,
        });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (properties[key] !== undefined) {
        walk(child, properties[key], path === '' ? key : `${path}.${key}`, problems);
      } else if (schema.additionalProperties === false) {
        problems.push({
          path: key,
          message: `schema 里没有 \`${key}\` 这个字段`,
          hint:
            Object.keys(properties).length > 0
              ? `允许的字段：${Object.keys(properties).join('、')}`
              : undefined,
        });
      }
    }
  }
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((t) => matchesType(value, t));
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/** 把 schema 里的类型名（"array"）翻成中文，注意别和 typeName(value) 混用。 */
function formatTypes(type) {
  const list = Array.isArray(type) ? type : [type];
  return list.map((name) => TYPE_NAMES[name] ?? name).join(' 或 ');
}

function typeName(value) {
  if (Array.isArray(value)) return TYPE_NAMES.array;
  if (value === null) return TYPE_NAMES.null;
  return TYPE_NAMES[typeof value] ?? typeof value;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
