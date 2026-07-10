/* global importScripts, loadPyodide */

// Pyodide is pinned so a lesson cannot change behavior after a CDN release.
const PYODIDE_VERSION = "0.28.3";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const PYTHON_PRELUDE = String.raw`
import io
import json
import math
from collections import deque
from collections.abc import Mapping, Sequence
from contextlib import redirect_stdout
from typing import Dict, List, Optional, Set, Tuple


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f"ListNode({self.val!r})"


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val!r})"


class Node:
    """A permissive LeetCode node for graphs, random lists, and N-ary trees."""

    def __init__(
        self,
        val=0,
        next=None,
        random=None,
        left=None,
        right=None,
        neighbors=None,
        children=None,
    ):
        self.val = val
        self.next = next
        self.random = random
        self.left = left
        self.right = right
        self.neighbors = [] if neighbors is None else neighbors
        self.children = [] if children is None else children

    def __repr__(self):
        return f"Node({self.val!r})"


def make_list(values):
    if values is None:
        return None
    dummy = ListNode()
    tail = dummy
    for value in values:
        tail.next = ListNode(value)
        tail = tail.next
    return dummy.next


build_list = make_list


def list_nodes(head, limit=10000):
    nodes = []
    seen = set()
    current = head
    while current is not None and id(current) not in seen:
        if len(nodes) >= limit:
            raise ValueError(f"linked list exceeded the {limit}-node safety limit")
        seen.add(id(current))
        nodes.append(current)
        current = current.next
    return nodes


def list_values(head, limit=10000):
    return [node.val for node in list_nodes(head, limit)]


def list_node_at(head, index):
    if index is None or index < 0:
        return None
    current = head
    for _ in range(index):
        if current is None:
            return None
        current = current.next
    return current


def build_cycle(values, pos=-1):
    head = make_list(values)
    if head is None or pos is None or pos < 0:
        return head
    entry = list_node_at(head, pos)
    if entry is None:
        raise IndexError("cycle entry index is outside the linked list")
    tail = head
    while tail.next is not None:
        tail = tail.next
    tail.next = entry
    return head


make_cycle = build_cycle
build_cycle_list = build_cycle


def cycle_entry_index(head, limit=10000):
    seen = {}
    current = head
    index = 0
    while current is not None:
        identity = id(current)
        if identity in seen:
            return seen[identity]
        if index >= limit:
            raise ValueError(f"linked list exceeded the {limit}-node safety limit")
        seen[identity] = index
        current = current.next
        index += 1
    return -1


def make_tree(values):
    values = [] if values is None else list(values)
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    index = 1
    while queue and index < len(values):
        node = queue.popleft()
        if index < len(values) and values[index] is not None:
            node.left = TreeNode(values[index])
            queue.append(node.left)
        index += 1
        if index < len(values) and values[index] is not None:
            node.right = TreeNode(values[index])
            queue.append(node.right)
        index += 1
    return root


build_tree = make_tree


def tree_values(root, limit=10000):
    if root is None:
        return []
    output = []
    queue = deque([root])
    visited = set()
    while queue:
        if len(output) >= limit:
            raise ValueError(f"tree exceeded the {limit}-slot safety limit")
        node = queue.popleft()
        if node is None:
            output.append(None)
            continue
        identity = id(node)
        if identity in visited:
            raise ValueError("tree contains a cycle or shared child")
        visited.add(identity)
        output.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while output and output[-1] is None:
        output.pop()
    return output


def mutate_first(function, first, *args, **kwargs):
    """Run an in-place solution and return its first mutable argument."""
    if not callable(function) and callable(first):
        function, first = first, function
    function(first, *args, **kwargs)
    return first


def mutated(first, function, *args, **kwargs):
    """Run an in-place LeetCode function and return its mutated input."""
    function(first, *args, **kwargs)
    return first


def node_value(node):
    return None if node is None else node.val


def inorder_values(root):
    output = []
    stack = []
    current = root
    while current is not None or stack:
        while current is not None:
            stack.append(current)
            current = current.left
        current = stack.pop()
        output.append(current.val)
        current = current.right
    return output


def is_height_balanced(root):
    def height(node):
        if node is None:
            return 0
        left = height(node.left)
        if left < 0:
            return -1
        right = height(node.right)
        if right < 0 or abs(left - right) > 1:
            return -1
        return max(left, right) + 1
    return height(root) >= 0


def flattened_values(root, function):
    function(root)
    output = []
    current = root
    seen = set()
    while current is not None:
        if id(current) in seen:
            raise ValueError("flattened tree contains a cycle")
        if current.left is not None:
            raise ValueError("flattened tree still contains a left child")
        seen.add(id(current))
        output.append(current.val)
        current = current.right
    return output


def lca_value(root, first_value, second_value, function):
    first = None
    second = None
    queue = deque([root] if root is not None else [])
    while queue and (first is None or second is None):
        node = queue.popleft()
        if node.val == first_value and first is None:
            first = node
        if node.val == second_value and second is None:
            second = node
        if node.left is not None:
            queue.append(node.left)
        if node.right is not None:
            queue.append(node.right)
    if first is None or second is None:
        raise ValueError("requested LCA node was not found in the tree")
    answer = function(root, first, second)
    return node_value(answer)


def _stable_sort_key(value):
    try:
        return json.dumps(_jsonable(value), ensure_ascii=False, sort_keys=True)
    except Exception:
        return repr(value)


def canonical_groups(groups):
    normalized = [sorted(list(group), key=_stable_sort_key) for group in groups]
    return sorted(normalized, key=_stable_sort_key)


def canonical_nested(value):
    if isinstance(value, Mapping):
        return {
            key: canonical_nested(item)
            for key, item in sorted(value.items(), key=lambda pair: repr(pair[0]))
        }
    if isinstance(value, (list, tuple, set, frozenset)):
        items = [canonical_nested(item) for item in value]
        return sorted(items, key=_stable_sort_key)
    return value


def _invoke(callable_value, arguments):
    if arguments is None:
        return callable_value()
    if isinstance(arguments, Mapping):
        return callable_value(**arguments)
    if isinstance(arguments, (list, tuple)):
        return callable_value(*arguments)
    return callable_value(arguments)


def run_operations(*params):
    """Run design-problem operations.

    Accepts either (Class, operations, arguments) or
    (operations, arguments, Class). The constructor operation produces None.
    """
    if len(params) != 3:
        raise TypeError("run_operations expects exactly three arguments")
    first, second, third = params
    if callable(first) or isinstance(first, str) or not isinstance(first, (list, tuple)):
        factory, operations, arguments = first, list(second), list(third)
    else:
        operations, arguments, factory = list(first), list(second), third
    if isinstance(factory, str):
        factory = globals().get(factory)
    if factory is None:
        raise ValueError("operation class/factory was not found")
    if len(operations) != len(arguments):
        raise ValueError("operations and arguments must have the same length")

    instance = None
    output = []
    constructor_names = {
        "__init__",
        "constructor",
        getattr(factory, "__name__", ""),
    }
    start = 0
    if operations and operations[0] in constructor_names:
        instance = _invoke(factory, arguments[0])
        output.append(None)
        start = 1
    elif isinstance(factory, type) or callable(factory):
        instance = factory()
    else:
        instance = factory

    for index in range(start, len(operations)):
        method = getattr(instance, operations[index])
        output.append(_invoke(method, arguments[index]))
    return output


def _attach_tail(prefix_head, shared_head):
    if prefix_head is None:
        return shared_head
    tail = prefix_head
    visited = set()
    while tail.next is not None:
        if id(tail) in visited:
            raise ValueError("cannot attach an intersection to a cyclic list")
        visited.add(id(tail))
        tail = tail.next
    tail.next = shared_head
    return prefix_head


def build_intersection(values_a, values_b, shared_or_skip_a=None, skip_b=None):
    """Return (head_a, head_b) with a shared tail.

    Forms supported:
      build_intersection(prefix_a, prefix_b, shared_values)
      build_intersection(full_a, full_b, skip_a, skip_b)
    """
    if isinstance(shared_or_skip_a, (list, tuple)) or shared_or_skip_a is None:
        shared = make_list([] if shared_or_skip_a is None else shared_or_skip_a)
        return (
            _attach_tail(make_list(values_a), shared),
            _attach_tail(make_list(values_b), shared),
        )

    skip_a = int(shared_or_skip_a)
    skip_b = int(skip_b)
    head_a = make_list(values_a)
    shared = list_node_at(head_a, skip_a)
    prefix_b = make_list(list(values_b)[:skip_b])
    head_b = _attach_tail(prefix_b, shared)
    return head_a, head_b


make_intersection = build_intersection
build_intersecting_lists = build_intersection
make_intersecting_lists = build_intersection


def intersection_indices(head_a, head_b, node):
    def find(head):
        for index, item in enumerate(list_nodes(head)):
            if item is node:
                return index
        return -1
    return [find(head_a), find(head_b)]


def make_random_list(values, random_indices=None):
    values = [] if values is None else list(values)
    if random_indices is None and values and isinstance(values[0], (list, tuple)):
        pairs = values
        values = [pair[0] for pair in pairs]
        random_indices = [pair[1] for pair in pairs]
    if random_indices is None:
        random_indices = [None] * len(values)
    random_indices = list(random_indices)
    if len(values) != len(random_indices):
        raise ValueError("values and random_indices must have the same length")
    nodes = [Node(value) for value in values]
    for index, node in enumerate(nodes):
        node.next = nodes[index + 1] if index + 1 < len(nodes) else None
        random_index = random_indices[index]
        if random_index is not None and random_index >= 0:
            node.random = nodes[random_index]
    return nodes[0] if nodes else None


build_random_list = make_random_list


def random_list_values(head, limit=10000):
    nodes = []
    by_identity = {}
    current = head
    while current is not None and id(current) not in by_identity:
        if len(nodes) >= limit:
            raise ValueError(f"random list exceeded the {limit}-node safety limit")
        by_identity[id(current)] = len(nodes)
        nodes.append(current)
        current = current.next
    return [
        [node.val, None if node.random is None else by_identity.get(id(node.random), -1)]
        for node in nodes
    ]


random_values = random_list_values
canonical_random_list = random_list_values


def random_list_is_deep_copy(original, copied):
    original_nodes = list_nodes(original)
    copied_nodes = list_nodes(copied)
    if len(original_nodes) != len(copied_nodes):
        return False
    if any(left is right for left, right in zip(original_nodes, copied_nodes)):
        return False
    return random_list_values(original) == random_list_values(copied)


verify_random_copy = random_list_is_deep_copy


def make_graph(adjacency):
    adjacency = [] if adjacency is None else list(adjacency)
    nodes = [Node(index + 1) for index in range(len(adjacency))]
    for index, neighbors in enumerate(adjacency):
        nodes[index].neighbors = [nodes[value - 1] for value in neighbors]
    return nodes[0] if nodes else None


build_graph = make_graph


def graph_values(start, limit=10000):
    if start is None:
        return []
    queue = deque([start])
    nodes = {}
    while queue:
        node = queue.popleft()
        if id(node) in nodes:
            continue
        if len(nodes) >= limit:
            raise ValueError(f"graph exceeded the {limit}-node safety limit")
        nodes[id(node)] = node
        queue.extend(node.neighbors)
    ordered = sorted(nodes.values(), key=lambda node: node.val)
    return [sorted(neighbor.val for neighbor in node.neighbors) for node in ordered]


graph_adjacency = graph_values


def _node_json(node):
    if isinstance(node, ListNode):
        entry = cycle_entry_index(node)
        values = list_values(node)
        return values if entry < 0 else {"values": values, "cycle": entry}
    if isinstance(node, TreeNode):
        return tree_values(node)
    if isinstance(node, Node):
        if node.neighbors:
            return graph_values(node)
        if node.left is not None or node.right is not None:
            return tree_values(node)
        return random_list_values(node)
    return node


def _jsonable(value, seen=None):
    value = _node_json(value)
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if seen is None:
        seen = set()
    identity = id(value)
    if identity in seen:
        return "<cycle>"
    if isinstance(value, Mapping):
        seen.add(identity)
        result = {str(key): _jsonable(item, seen) for key, item in value.items()}
        seen.remove(identity)
        return result
    if isinstance(value, (list, tuple)):
        seen.add(identity)
        result = [_jsonable(item, seen) for item in value]
        seen.remove(identity)
        return result
    if isinstance(value, (set, frozenset)):
        return sorted((_jsonable(item, seen) for item in value), key=_stable_sort_key)
    if hasattr(value, "__dict__"):
        seen.add(identity)
        result = {
            str(key): _jsonable(item, seen)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
        seen.remove(identity)
        return result
    return repr(value)


def _deep_equal(actual, expected):
    actual = _node_json(actual)
    expected = _node_json(expected)
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, float) and isinstance(expected, float):
        if math.isnan(actual) and math.isnan(expected):
            return True
    if isinstance(actual, Mapping) and isinstance(expected, Mapping):
        return (
            set(actual.keys()) == set(expected.keys())
            and all(_deep_equal(actual[key], expected[key]) for key in actual)
        )
    if (
        isinstance(actual, Sequence)
        and isinstance(expected, Sequence)
        and not isinstance(actual, (str, bytes, bytearray))
        and not isinstance(expected, (str, bytes, bytearray))
    ):
        return len(actual) == len(expected) and all(
            _deep_equal(left, right) for left, right in zip(actual, expected)
        )
    if isinstance(actual, (set, frozenset)) and isinstance(expected, (set, frozenset)):
        return actual == expected
    try:
        return actual == expected
    except Exception:
        return False


__stdout_buffer = io.StringIO()
`;

let runtimePromise;
let runQueue = Promise.resolve();

function postStatus(status, extra = {}) {
  self.postMessage({ type: "status", status, ...extra });
}

function serializeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: error?.name || "Error",
    message,
    traceback: error?.stack || message,
  };
}

async function loadRuntime() {
  if (runtimePromise) return runtimePromise;

  postStatus("loading", {
    phase: "runtime",
    message: "正在加载 Python 运行环境…",
    version: PYODIDE_VERSION,
  });

  runtimePromise = (async () => {
    importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
    const runtime = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    postStatus("ready", {
      phase: "runtime",
      message: "Python 运行环境已就绪",
      version: PYODIDE_VERSION,
    });
    return runtime;
  })().catch((error) => {
    runtimePromise = undefined;
    self.postMessage({
      type: "error",
      phase: "loading",
      error: serializeError(error),
    });
    throw error;
  });

  return runtimePromise;
}

function readStdout(runtime, globals) {
  try {
    return runtime.runPython("__stdout_buffer.getvalue()", { globals }) || "";
  } catch {
    return "";
  }
}

function parsePythonJson(runtime, globals, expression) {
  const serialized = runtime.runPython(
    `json.dumps(_jsonable(${expression}), ensure_ascii=False, allow_nan=True)`,
    { globals },
  );
  return JSON.parse(serialized);
}

async function executeRequest(payload) {
  const startedAt = performance.now();
  const requestId = payload?.id;
  let globals;
  let runtime;

  try {
    if (!payload || typeof payload.code !== "string") {
      throw new TypeError("Worker message must include a string `code` field.");
    }
    if (!Array.isArray(payload.tests)) {
      throw new TypeError("Worker message must include a `tests` array.");
    }

    runtime = await loadRuntime();
    postStatus("running", {
      id: requestId,
      completed: 0,
      total: payload.tests.length,
      message: "正在运行代码…",
    });

    // A fresh dict prevents user variables and class definitions leaking between runs.
    globals = runtime.runPython("dict()");
    await runtime.runPythonAsync(PYTHON_PRELUDE, { globals });
    globals.set("__user_code", payload.code);

    await runtime.runPythonAsync(
      [
        "with redirect_stdout(__stdout_buffer):",
        "    exec(compile(__user_code, '<solution>', 'exec'), globals(), globals())",
        "if 'Solution' in globals() and isinstance(Solution, type):",
        "    __solution_instance = Solution()",
        "    for __method_name in dir(__solution_instance):",
        "        if not __method_name.startswith('_'):",
        "            __method = getattr(__solution_instance, __method_name)",
        "            if callable(__method):",
        "                globals().setdefault(__method_name, __method)",
      ].join("\n"),
      { globals },
    );

    const results = [];
    for (let index = 0; index < payload.tests.length; index += 1) {
      const test = payload.tests[index];
      const testStartedAt = performance.now();
      const baseResult = {
        index,
        name: typeof test?.name === "string" ? test.name : `测试 ${index + 1}`,
        expression: test?.expression,
        expected: test?.expected ?? null,
      };

      if (!test || typeof test.expression !== "string" || !test.expression.trim()) {
        results.push({
          ...baseResult,
          passed: false,
          actual: null,
          error: {
            name: "TypeError",
            message: "Each test must include a non-empty string `expression`.",
          },
          duration: performance.now() - testStartedAt,
        });
        continue;
      }

      try {
        globals.set("__test_expression", test.expression);
        globals.set("__expected_json", JSON.stringify(test.expected ?? null));
        await runtime.runPythonAsync(
          [
            "with redirect_stdout(__stdout_buffer):",
            "    __actual = eval(compile(__test_expression, '<test-expression>', 'eval'), globals(), globals())",
            "__expected = json.loads(__expected_json)",
            "__passed = _deep_equal(__actual, __expected)",
          ].join("\n"),
          { globals },
        );

        results.push({
          ...baseResult,
          passed: Boolean(runtime.runPython("__passed", { globals })),
          actual: parsePythonJson(runtime, globals, "__actual"),
          error: null,
          duration: performance.now() - testStartedAt,
        });
      } catch (error) {
        results.push({
          ...baseResult,
          passed: false,
          actual: null,
          error: serializeError(error),
          duration: performance.now() - testStartedAt,
        });
      }

      postStatus("running", {
        id: requestId,
        completed: index + 1,
        total: payload.tests.length,
        message: `已完成 ${index + 1} / ${payload.tests.length} 个测试`,
      });
    }

    self.postMessage({
      type: "result",
      ...(requestId === undefined ? {} : { id: requestId }),
      results,
      stdout: readStdout(runtime, globals),
      duration: performance.now() - startedAt,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      ...(requestId === undefined ? {} : { id: requestId }),
      error: serializeError(error),
      stdout: runtime && globals ? readStdout(runtime, globals) : "",
      duration: performance.now() - startedAt,
    });
  } finally {
    globals?.destroy?.();
  }
}

self.addEventListener("message", (event) => {
  // Serialize jobs because Pyodide has one interpreter and stdout is process-global.
  runQueue = runQueue
    .catch(() => undefined)
    .then(() => executeRequest(event.data));
});

// Begin fetching asynchronously; incoming jobs simply await the same promise.
void loadRuntime();
