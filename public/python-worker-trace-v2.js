/* global importScripts, loadPyodide */

// Worker protocol v2 adds bounded, real per-line execution traces.

// Pyodide is pinned so a lesson cannot change behavior after a CDN release.
const PYODIDE_VERSION = "0.28.3";
const IS_NATIVE_APP = self.location.protocol === "capacitor:";
const PYODIDE_INDEX_URL = IS_NATIVE_APP
  ? new URL("./pyodide/", self.location.href).href
  : `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const PYTHON_PRELUDE = String.raw`
import io
import inspect
import json
import math
import sys
import traceback
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
    """A permissive judge-compatible node for graphs, random lists, and N-ary trees."""

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


class _BoundedTextBuffer:
    """A stdout target that never retains more than a small learning-friendly preview."""

    def __init__(self, limit=100000):
        self.limit = limit
        self.parts = []
        self.size = 0
        self.truncated = False

    def write(self, text):
        if type(text) is not str:
            text = str(text)
        original_size = len(text)
        remaining = self.limit - self.size
        if remaining > 0:
            piece = text[:remaining]
            self.parts.append(piece)
            self.size += len(piece)
        if original_size > remaining:
            self.truncated = True
        return original_size

    def flush(self):
        return None

    def getvalue(self):
        text = "".join(self.parts)
        if self.truncated and text:
            marker = "\n… stdout was shortened by the animation safety limit"
            text = text[: max(0, self.limit - len(marker))] + marker
        return text


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
    """Run an in-place exercise function and return its mutated input."""
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


__runner_trace_types = (ListNode, TreeNode, Node)
__stdout_buffer = _BoundedTextBuffer()
`;

const PYTHON_TRACE_SUPPORT = String.raw`
import builtins as __trace_builtins
import dis as __trace_dis
import inspect as __trace_inspect
import itertools as __trace_itertools
import json as __trace_json
import math as __trace_math
import sys as __trace_sys
from collections import deque as __trace_deque


def __make_execution_trace_support():
    safe_type = __trace_builtins.type
    safe_id = __trace_builtins.id
    safe_len = __trace_builtins.len
    safe_int = __trace_builtins.int
    safe_str = __trace_builtins.str
    safe_object = __trace_builtins.object
    safe_base_exception = __trace_builtins.BaseException
    bool_type = __trace_builtins.bool
    int_type = __trace_builtins.int
    float_type = __trace_builtins.float
    str_type = __trace_builtins.str
    bytes_type = __trace_builtins.bytes
    bytearray_type = __trace_builtins.bytearray
    dict_type = __trace_builtins.dict
    list_type = __trace_builtins.list
    tuple_type = __trace_builtins.tuple
    range_type = __trace_builtins.range
    set_type = __trace_builtins.set
    frozenset_type = __trace_builtins.frozenset
    deque_type = __trace_deque
    safe_enumerate = __trace_builtins.enumerate
    safe_all = __trace_builtins.all
    safe_sorted = __trace_builtins.sorted
    safe_max = __trace_builtins.max
    json_dumps = __trace_json.dumps
    is_finite = __trace_math.isfinite
    is_nan = __trace_math.isnan
    take_items = __trace_itertools.islice
    instruction_names = __trace_dis.opname
    suspension_flags = (
        __trace_inspect.CO_GENERATOR
        | __trace_inspect.CO_COROUTINE
        | __trace_inspect.CO_ASYNC_GENERATOR
    )
    set_trace = __trace_sys.settrace
    disable_trace = lambda: set_trace(None)
    builtins_dictionary = safe_object.__getattribute__(__trace_builtins, "__dict__")
    max_events = 240
    max_depth = 2
    max_items = 8
    max_locals = 16
    max_string = 120
    max_local_chars = 12000
    max_value_chars = 2400
    max_payload_chars = 600000
    state = {}

    runner_types = __runner_trace_types
    if safe_type(runner_types) is not tuple_type or safe_len(runner_types) != 3:
        runner_types = ()
    list_node_type = runner_types[0] if runner_types else None
    tree_node_types = runner_types[1:] if runner_types else ()

    class ExecutionTraceLimit(safe_base_exception):
        pass

    def clip(text, limit=max_string):
        text = text if safe_type(text) is str_type else "<value>"
        return text if safe_len(text) <= limit else text[: limit - 1] + "…"

    def type_name(value):
        try:
            return clip(safe_type.__getattribute__(safe_type(value), "__name__"), 120)
        except safe_base_exception:
            return "object"

    def safe_integer(value):
        if int_type.bit_length(value) > 1024:
            return "<very large int>" if value >= 0 else "<very large negative int>"
        return value

    def safe_float_text(value):
        if is_nan(value):
            return "nan"
        return "inf" if value > 0 else "-inf"

    def safe_scalar_text(value):
        value_type = safe_type(value)
        if value is None:
            return "None"
        if value_type is str_type:
            return clip(value, 1000)
        if value_type is bool_type:
            return "True" if value else "False"
        if value_type is int_type:
            bounded = safe_integer(value)
            return int_type.__str__(bounded) if safe_type(bounded) is int_type else bounded
        if value_type is float_type:
            return float_type.__repr__(value) if is_finite(value) else safe_float_text(value)
        return None

    def error_message(error, limit=1000):
        error_type = safe_type(error)
        try:
            error_name = safe_type.__getattribute__(error_type, "__name__")
        except safe_base_exception:
            error_name = ""
        if dict_type.get(builtins_dictionary, error_name) is not error_type:
            return f"<{type_name(error)}>"
        try:
            arguments = safe_object.__getattribute__(error, "args")
        except safe_base_exception:
            return f"<{type_name(error)}>"
        if safe_type(arguments) is not tuple_type:
            return f"<{type_name(error)}>"
        parts = []
        for argument in arguments[:3]:
            text = safe_scalar_text(argument)
            if text is None:
                return f"<{type_name(error)}>"
            parts.append(text)
        return clip(", ".join(parts), limit)

    def value_snapshot(value, depth=0, seen=None):
        value_type = safe_type(value)
        if value is None or value_type is bool_type:
            return value
        if value_type is int_type:
            return safe_integer(value)
        if value_type is float_type:
            return value if is_finite(value) else safe_float_text(value)
        if value_type is str_type:
            return clip(value)
        if value_type in (bytes_type, bytearray_type):
            return f"<{type_name(value)}: {safe_len(value)} bytes>"
        if depth >= max_depth:
            return f"<{type_name(value)}>"
        if seen is None:
            seen = set_type()
        identity = safe_id(value)
        if identity in seen:
            return "<cycle>"
        seen.add(identity)
        try:
            if value_type is dict_type:
                entries = []
                more = False
                for index, (key, item) in safe_enumerate(dict_type.items(value)):
                    if index >= max_items:
                        more = True
                        break
                    entries.append([
                        value_snapshot(key, depth + 1, seen),
                        value_snapshot(item, depth + 1, seen),
                    ])
                return {
                    "__executionTraceType": "dict",
                    "entries": entries,
                    "more": more,
                }
            if value_type in (list_type, tuple_type):
                output = [value_snapshot(item, depth + 1, seen) for item in value[:max_items]]
                if safe_len(value) > max_items:
                    output.append(f"… {safe_len(value) - max_items} more")
                return output
            if value_type is range_type:
                output = [value_snapshot(item, depth + 1, seen) for item in value[:max_items]]
                if safe_len(value) > max_items:
                    output.append(f"… {safe_len(value) - max_items} more")
                return output
            if value_type is deque_type:
                output = [value_snapshot(item, depth + 1, seen) for item in take_items(value, max_items)]
                if safe_len(value) > max_items:
                    output.append(f"… {safe_len(value) - max_items} more")
                return output
            if value_type in (set_type, frozenset_type):
                output = [
                    value_snapshot(item, depth + 1, seen)
                    for item in take_items(value, max_items)
                ]
                if safe_len(value) > max_items:
                    output.append("… more items")
                return safe_sorted(
                    output,
                    key=lambda item: json_dumps(item, ensure_ascii=False, sort_keys=True),
                )
            if list_node_type is not None and value_type is list_node_type:
                values = []
                current = value
                node_seen = set_type()
                while current is not None and safe_id(current) not in node_seen and safe_len(values) < max_items:
                    node_seen.add(safe_id(current))
                    values.append(value_snapshot(safe_object.__getattribute__(current, "val"), depth + 1, seen))
                    current = safe_object.__getattribute__(current, "next")
                return {"type": "ListNode", "values": values, "more": current is not None}
            if tree_node_types and value_type in tree_node_types:
                return {
                    "type": type_name(value),
                    "val": value_snapshot(safe_object.__getattribute__(value, "val"), depth + 1, seen),
                }
            return f"<{type_name(value)}>"
        except safe_base_exception:
            return f"<{type_name(value)}: unavailable>"
        finally:
            seen.discard(identity)

    def result_snapshot(value):
        budget = {"nodes": 0, "characters": 0, "complete": True}
        seen = set_type()

        def incomplete(marker):
            budget["complete"] = False
            return marker

        def walk(item, depth=0):
            budget["nodes"] += 1
            if budget["nodes"] > 5000:
                return incomplete("<result too large>")
            item_type = safe_type(item)
            if item is None or item_type is bool_type:
                return item
            if item_type is int_type:
                bounded = safe_integer(item)
                if safe_type(bounded) is not int_type:
                    budget["complete"] = False
                return bounded
            if item_type is float_type:
                if is_finite(item):
                    return item
                return incomplete(safe_float_text(item))
            if item_type is str_type:
                budget["characters"] += safe_len(item)
                if safe_len(item) > 2000 or budget["characters"] > 100000:
                    return incomplete(clip(item, 2000))
                return item
            if item_type in (bytes_type, bytearray_type):
                return incomplete(f"<{type_name(item)}: {safe_len(item)} bytes>")
            if depth >= 8:
                return incomplete(f"<{type_name(item)}: nested too deeply>")
            identity = safe_id(item)
            if identity in seen:
                return incomplete("<cycle>")
            seen.add(identity)
            try:
                if item_type is dict_type:
                    limited_items = list_type(take_items(dict_type.items(item), 201))
                    more = safe_len(limited_items) > 200
                    if more:
                        limited_items = limited_items[:200]
                        incomplete("more items")
                    needs_typed_keys = more
                    if not needs_typed_keys:
                        for key, _ in limited_items:
                            if safe_type(key) is not str_type or safe_len(key) > 500:
                                needs_typed_keys = True
                                break
                    if not needs_typed_keys:
                        return {
                            key: walk(child, depth + 1)
                            for key, child in limited_items
                        }
                    return {
                        "__executionTraceType": "dict",
                        "entries": [
                            [walk(key, depth + 1), walk(child, depth + 1)]
                            for key, child in limited_items
                        ],
                        "more": more,
                    }
                if item_type in (list_type, tuple_type, range_type, deque_type, set_type, frozenset_type):
                    children = item[:200] if item_type in (list_type, tuple_type, range_type) else take_items(item, 200)
                    output = [walk(child, depth + 1) for child in children]
                    if safe_len(item) > 200:
                        output.append(incomplete(f"… {safe_len(item) - 200} more"))
                    if item_type in (set_type, frozenset_type):
                        output = safe_sorted(output, key=lambda child: json_dumps(child, ensure_ascii=False, sort_keys=True))
                    return output
                if list_node_type is not None and item_type is list_node_type:
                    values = []
                    current = item
                    node_seen = set_type()
                    while current is not None and safe_id(current) not in node_seen and safe_len(values) < 200:
                        node_seen.add(safe_id(current))
                        values.append(walk(safe_object.__getattribute__(current, "val"), depth + 1))
                        current = safe_object.__getattribute__(current, "next")
                    if current is not None:
                        values.append(incomplete("… more nodes or a cycle"))
                    return {"type": "ListNode", "values": values}
                return incomplete(f"<{type_name(item)}>")
            except safe_base_exception:
                return incomplete(f"<{type_name(item)}: unavailable>")
            finally:
                seen.discard(identity)

        return {"value": walk(value), "complete": budget["complete"]}

    def judge_equal(actual, expected):
        """Compare JSON-shaped judge values without invoking user display/equality hooks."""
        budget = {"nodes": 0}

        def scalar_equal(left, right):
            left_type = safe_type(left)
            right_type = safe_type(right)
            if left is None or right is None:
                return left is None and right is None
            if left_type is bool_type or right_type is bool_type:
                return left_type is bool_type and right_type is bool_type and left is right
            if left_type is int_type and right_type is int_type:
                return left == right
            if left_type in (int_type, float_type) and right_type in (int_type, float_type):
                return left == right
            if left_type is str_type and right_type is str_type:
                return left == right
            return None

        def walk(left, right, depth=0):
            budget["nodes"] += 1
            if budget["nodes"] > 50000 or depth > 100:
                return False
            scalar = scalar_equal(left, right)
            if scalar is not None:
                return scalar
            left_type = safe_type(left)
            right_type = safe_type(right)
            if left_type in (list_type, tuple_type) and right_type in (list_type, tuple_type):
                return safe_len(left) == safe_len(right) and safe_all(
                    walk(left[index], right[index], depth + 1)
                    for index in range_type(safe_len(left))
                )
            if left_type is dict_type and right_type is dict_type:
                if safe_len(left) != safe_len(right):
                    return False
                unmatched = list_type(dict_type.items(left))
                for right_key, right_value in dict_type.items(right):
                    match_index = None
                    for index, (left_key, left_value) in safe_enumerate(unmatched):
                        if scalar_equal(left_key, right_key) is True and walk(left_value, right_value, depth + 1):
                            match_index = index
                            break
                    if match_index is None:
                        return False
                    list_type.pop(unmatched, match_index)
                return not unmatched
            if list_node_type is not None and left_type is list_node_type and right_type in (list_type, tuple_type):
                current = left
                seen_nodes = set_type()
                index = 0
                while current is not None and safe_id(current) not in seen_nodes and index < safe_len(right):
                    seen_nodes.add(safe_id(current))
                    if not walk(safe_object.__getattribute__(current, "val"), right[index], depth + 1):
                        return False
                    current = safe_object.__getattribute__(current, "next")
                    index += 1
                return current is None and index == safe_len(right)
            return False

        try:
            return bool_type(walk(actual, expected))
        except safe_base_exception:
            return False

    def instruction_name(frame):
        try:
            offset = safe_int(frame.f_lasti)
            bytecode = frame.f_code.co_code
            if offset < 0 or offset >= safe_len(bytecode):
                return ""
            return instruction_names[bytecode[offset]]
        except safe_base_exception:
            return ""

    def locals_snapshot(frame):
        output = {}
        used_chars = 2
        visible = [
            (name, value)
            for name, value in frame.f_locals.items()
            if safe_type(name) is str_type and name != "self" and not name.startswith("__")
        ]
        visible = safe_sorted(visible, key=lambda item: item[0])
        for name, value in visible[:max_locals]:
            snapshot = value_snapshot(value)
            try:
                encoded = json_dumps(snapshot, ensure_ascii=False, allow_nan=False, sort_keys=True)
            except safe_base_exception:
                snapshot = f"<{type_name(value)}: unavailable>"
                encoded = json_dumps(snapshot, ensure_ascii=False)
            if safe_len(encoded) > max_value_chars:
                snapshot = f"<{type_name(value)}: value too large to animate>"
                encoded = json_dumps(snapshot, ensure_ascii=False)
            entry_size = safe_len(name) + safe_len(encoded) + 6
            if used_chars + entry_size > max_local_chars:
                output["…"] = "more variables hidden by the animation size limit"
                break
            output[name] = snapshot
            used_chars += entry_size
        if safe_len(visible) > max_locals:
            output["…"] = f"{safe_len(visible) - max_locals} more variables"
        return output

    def frame_depth(frame):
        depth = 0
        parent = frame.f_back
        while parent is not None and depth < 100:
            if parent.f_code.co_filename == "<solution>":
                depth += 1
            parent = parent.f_back
        return depth

    def reset():
        state.clear()
        state.update({
            "events": [],
            "truncated": False,
            "stopReason": None,
            "payloadChars": 0,
            "frames": {},
            "nextFrameId": 0,
        })

    def frame_id(frame):
        identity = safe_id(frame)
        stored = state["frames"].get(identity)
        if stored is None or stored[0] is not frame:
            state["nextFrameId"] += 1
            stored = (frame, safe_str(state["nextFrameId"]))
            state["frames"][identity] = stored
        return stored[1]

    def mark_truncated(reason):
        state["truncated"] = True
        state["stopReason"] = reason

    def stop_for_limit(reason, message, event):
        mark_truncated(reason)
        if event in ("call", "line"):
            disable_trace()
            raise ExecutionTraceLimit(message)

    def capture(frame, event, argument):
        if frame.f_code.co_filename != "<solution>":
            return None
        if event not in ("call", "line", "return", "exception"):
            return capture
        if safe_len(state["events"]) >= max_events:
            stop_for_limit(
                "event-limit",
                f"Animation stopped after {max_events} steps.",
                event,
            )
            return capture

        identity = safe_id(frame)
        stored_frame = state["frames"].get(identity)
        opcode = instruction_name(frame) if event == "return" else ""
        is_yield = event == "return" and (
            opcode in ("YIELD_VALUE", "YIELD_FROM")
            or (opcode == "RESUME" and frame.f_code.co_flags & suspension_flags)
        )
        is_unwind = event == "return" and not is_yield and opcode not in ("RETURN_VALUE", "RETURN_CONST")
        entry_kind = "yield" if is_yield else "resume" if event == "call" and stored_frame and stored_frame[0] is frame else event

        entry = {
            "kind": entry_kind,
            "line": safe_max(1, safe_int(frame.f_lineno)),
            "functionName": clip(frame.f_code.co_name, 160),
            "frameId": frame_id(frame),
            "depth": frame_depth(frame),
            "locals": locals_snapshot(frame),
        }
        if event == "return":
            if is_yield:
                entry["returnValue"] = value_snapshot(argument)
            elif is_unwind:
                entry["unwind"] = True
            else:
                entry["returnValue"] = value_snapshot(argument)
        elif event == "exception":
            error_type, error, _ = argument
            entry["error"] = {
                "name": clip(safe_type.__getattribute__(error_type, "__name__"), 120),
                "message": error_message(error, 1000),
            }

        try:
            entry_size = safe_len(json_dumps(entry, ensure_ascii=False, allow_nan=False, sort_keys=True))
        except safe_base_exception:
            entry = {
                "kind": event,
                "line": safe_max(1, safe_int(frame.f_lineno)),
                "functionName": clip(frame.f_code.co_name, 160),
                "frameId": frame_id(frame),
                "depth": frame_depth(frame),
                "locals": {"…": "variables unavailable"},
            }
            entry_size = safe_len(json_dumps(entry, ensure_ascii=False, sort_keys=True))
        if state["payloadChars"] + entry_size > max_payload_chars:
            stop_for_limit(
                "payload-limit",
                "Animation stopped because the variable snapshots became too large.",
                event,
            )
            return capture
        state["events"].append(entry)
        state["payloadChars"] += entry_size
        if event == "return" and not is_yield:
            state["frames"].pop(identity, None)
        return capture

    def disable():
        disable_trace()

    def enable():
        set_trace(capture)

    reset()
    return {
        "baseException": safe_base_exception,
        "capture": capture,
        "disable": disable,
        "enable": enable,
        "errorMessage": error_message,
        "judgeEqual": judge_equal,
        "limit": ExecutionTraceLimit,
        "reset": reset,
        "resultSnapshot": result_snapshot,
        "state": state,
        "typeName": type_name,
    }


__trace_support = __make_execution_trace_support()
del __make_execution_trace_support
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

function lockNativeRuntimeNetwork() {
  if (!IS_NATIVE_APP) return;
  const blocked = () => Promise.reject(new TypeError("Network access is disabled inside the offline Python runner."));
  self.fetch = blocked;
  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.importScripts = () => {
    throw new TypeError("Loading additional scripts is disabled inside the offline Python runner.");
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
    lockNativeRuntimeNetwork();
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
    const output = runtime.runPython("__stdout_buffer.getvalue()", { globals });
    return typeof output === "string" ? output.slice(0, 100_000) : "";
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
    globals.set("__signature_contract_json", JSON.stringify(payload.signature ?? null));

    await runtime.runPythonAsync(
      [
        "with redirect_stdout(__stdout_buffer):",
        "    exec(compile(__user_code, '<solution>', 'exec'), globals(), globals())",
        "__signature_contract = json.loads(__signature_contract_json)",
        "__signature_issue = None",
        "def __accepts_positional_count(callable_value, count):",
        "    try:",
        "        signature = inspect.signature(callable_value)",
        "    except (TypeError, ValueError):",
        "        return True",
        "    parameters = list(signature.parameters.values())",
        "    positional = [parameter for parameter in parameters if parameter.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)]",
        "    required = sum(parameter.default is inspect.Parameter.empty for parameter in positional)",
        "    maximum = math.inf if any(parameter.kind == inspect.Parameter.VAR_POSITIONAL for parameter in parameters) else len(positional)",
        "    required_keyword_only = any(parameter.kind == inspect.Parameter.KEYWORD_ONLY and parameter.default is inspect.Parameter.empty for parameter in parameters)",
        "    return not required_keyword_only and required <= count <= maximum",
        "if isinstance(__signature_contract, dict):",
        "    __class_name = __signature_contract.get('className')",
        "    __required_class = globals().get(__class_name) if isinstance(__class_name, str) else None",
        "    if __required_class is None:",
        "        __signature_issue = {'code': 'missing_class', 'symbol': __class_name}",
        "    elif not isinstance(__required_class, type):",
        "        __signature_issue = {'code': 'class_not_type', 'symbol': __class_name}",
        "    elif not __accepts_positional_count(__required_class, len(__signature_contract.get('constructorParams') or [])):",
        "        __signature_issue = {'code': 'incompatible_parameters', 'symbol': '__init__'}",
        "    else:",
        "        for __method_contract in __signature_contract.get('methods') or []:",
        "            __method_name = __method_contract.get('name')",
        "            try:",
        "                __descriptor = inspect.getattr_static(__required_class, __method_name)",
        "            except AttributeError:",
        "                __signature_issue = {'code': 'missing_method', 'symbol': __method_name}",
        "                break",
        "            __method = getattr(__required_class, __method_name, None)",
        "            if not callable(__method):",
        "                __signature_issue = {'code': 'method_not_callable', 'symbol': __method_name}",
        "                break",
        "            __expected_count = len(__method_contract.get('params') or [])",
        "            if not isinstance(__descriptor, (staticmethod, classmethod)):",
        "                __expected_count += 1",
        "            if not __accepts_positional_count(__method, __expected_count):",
        "                __signature_issue = {'code': 'incompatible_parameters', 'symbol': __method_name}",
        "                break",
        "    if __signature_issue is None and __signature_contract.get('kind') == 'solution':",
        "        __solution_instance = __required_class()",
        "        for __method_contract in __signature_contract.get('methods') or []:",
        "            __method_name = __method_contract.get('name')",
        "            globals()[__method_name] = getattr(__solution_instance, __method_name)",
        "elif 'Solution' in globals() and isinstance(Solution, type):",
        "    __solution_instance = Solution()",
        "    for __method_name in dir(__solution_instance):",
        "        if not __method_name.startswith('_'):",
        "            __method = getattr(__solution_instance, __method_name)",
        "            if callable(__method):",
        "                globals().setdefault(__method_name, __method)",
      ].join("\n"),
      { globals },
    );

    const signatureIssue = parsePythonJson(runtime, globals, "__signature_issue");
    if (signatureIssue) {
      self.postMessage({
        type: "error",
        ...(requestId === undefined ? {} : { id: requestId }),
        error: {
          name: "SignatureError",
          message: "The required LeetCode class or method signature has changed.",
          code: signatureIssue.code,
          symbol: signatureIssue.symbol,
        },
        stdout: readStdout(runtime, globals),
        duration: performance.now() - startedAt,
      });
      return;
    }

    // The same exact-builtins snapshotter keeps both ordinary results and
    // animation results bounded without calling user __repr__/__str__ hooks.
    await runtime.runPythonAsync(PYTHON_TRACE_SUPPORT, { globals });

    if (payload.mode === "trace") {
      const traceIndex = Number(payload.traceTestIndex ?? 0);
      if (!Number.isInteger(traceIndex) || traceIndex < 0 || traceIndex >= payload.tests.length) {
        throw new RangeError("Trace mode requires a valid `traceTestIndex`.");
      }
      const test = payload.tests[traceIndex];
      if (!test || typeof test.expression !== "string" || !test.expression.trim()) {
        throw new TypeError("The selected trace test must include a non-empty expression.");
      }
      postStatus("tracing", {
        id: requestId,
        completed: 0,
        total: 1,
        message: "正在生成逐行动画…",
      });
      const testStartedAt = performance.now();
      globals.set("__test_expression", test.expression);
      globals.set("__expected_json", JSON.stringify(test.expected ?? null));
      await runtime.runPythonAsync(
        [
          "__trace_support['reset']()",
          "__trace_error = None",
          "__trace_has_actual = False",
          "__trace_limited = False",
          "try:",
          "    __trace_support['enable']()",
          "    with redirect_stdout(__stdout_buffer):",
          "        __actual = eval(compile(__test_expression, '<test-expression>', 'eval'), globals(), globals())",
          "    __trace_has_actual = True",
          "except __trace_support['limit']:",
          "    __trace_limited = True",
          "except __trace_support['baseException'] as __caught_error:",
          "    __trace_error = {",
          "        'name': __trace_support['typeName'](__caught_error),",
          "        'message': __trace_support['errorMessage'](__caught_error, 2000),",
          "        'traceback': '',",
          "    }",
          "finally:",
          "    __trace_support['disable']()",
          "__trace_actual_snapshot = None",
          "__trace_actual_complete = False",
          "if __trace_has_actual:",
          "    __trace_result_payload = __trace_support['resultSnapshot'](__actual)",
          "    __trace_actual_snapshot = __trace_result_payload['value']",
          "    __trace_actual_complete = bool(__trace_result_payload['complete'])",
          "__expected = json.loads(__expected_json)",
          "__passed = bool(__trace_has_actual and __trace_support['judgeEqual'](__actual, __expected))",
        ].join("\n"),
        { globals },
      );

      const traceError = parsePythonJson(runtime, globals, "__trace_error");
      const traceHasActual = Boolean(runtime.runPython("__trace_has_actual", { globals }));
      const traceResult = {
        index: traceIndex,
        name: typeof test.name === "string"
          ? test.name
          : typeof test.inputLabel === "string" ? test.inputLabel : `测试 ${traceIndex + 1}`,
        expression: test.expression,
        expected: test.expected ?? null,
        actual: traceHasActual ? parsePythonJson(runtime, globals, "__trace_actual_snapshot") : null,
        hasActual: traceHasActual,
        passed: Boolean(runtime.runPython("__passed", { globals })),
        error: traceError,
        duration: performance.now() - testStartedAt,
      };
      self.postMessage({
        type: "trace-result",
        ...(requestId === undefined ? {} : { id: requestId }),
        trace: parsePythonJson(runtime, globals, "__trace_support['state']['events']"),
        truncated: Boolean(runtime.runPython("__trace_support['state']['truncated']", { globals })),
        stopReason: parsePythonJson(runtime, globals, "__trace_support['state']['stopReason']"),
        result: traceResult,
        stdout: readStdout(runtime, globals),
        duration: performance.now() - startedAt,
      });
      return;
    }

    const results = [];
    for (let index = 0; index < payload.tests.length; index += 1) {
      const test = payload.tests[index];
      const testStartedAt = performance.now();
      const baseResult = {
        index,
        name: typeof test?.name === "string"
          ? test.name
          : typeof test?.inputLabel === "string" ? test.inputLabel : `测试 ${index + 1}`,
        expression: test?.expression,
        expected: test?.expected ?? null,
      };

      if (!test || typeof test.expression !== "string" || !test.expression.trim()) {
        results.push({
          ...baseResult,
          passed: false,
          actual: null,
          hasActual: false,
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
            "__normal_result_payload = __trace_support['resultSnapshot'](__actual)",
            "__normal_actual_snapshot = __normal_result_payload['value']",
          ].join("\n"),
          { globals },
        );

        results.push({
          ...baseResult,
          passed: Boolean(runtime.runPython("__passed", { globals })),
          actual: parsePythonJson(runtime, globals, "__normal_actual_snapshot"),
          hasActual: true,
          error: null,
          duration: performance.now() - testStartedAt,
        });
      } catch (error) {
        results.push({
          ...baseResult,
          passed: false,
          actual: null,
          hasActual: false,
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
