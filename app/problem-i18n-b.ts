import type { ProblemEnglishCopy } from "./problem-i18n-types";

export const problemEnglishB: Record<number, ProblemEnglishCopy> = {
  146: {
    title: "LRU Cache",
    topic: "Linked List",
    summary:
      "Build a fixed-capacity cache whose reads and writes are constant time and whose eviction policy removes the least recently used entry.",
    example:
      "capacity = 2; put(1,1), put(2,2), get(1), put(3,3) → get(2) returns -1",
    method:
      "Use a hash map to locate entries and a doubly linked list to keep them ordered from least to most recently used.",
    hint:
      "Whenever an entry is read or updated, detach its node and move it to the most-recently-used end.",
    complexity: "Average O(1) per get or put; O(capacity) space.",
    statement:
      "Design an LRUCache with a positive capacity. get(key) returns the stored value when the key exists and -1 otherwise. put(key, value) inserts or updates an entry; if that operation exceeds capacity, discard the entry that has gone unused for the longest time.",
    requirements: [
      "Implement the LRUCache constructor, get, and put methods.",
      "A successful get and every put count as recent use of that key.",
      "Updating an existing key must not increase the number of cached entries.",
      "Both public operations should run in average O(1) time.",
    ],
  },
  94: {
    title: "Binary Tree Inorder Traversal",
    topic: "Binary Tree",
    summary: "Return the node values of a binary tree in left-root-right order.",
    example: "root = [1,null,2,3] → [1,3,2]",
    method:
      "Push the current node and all of its left descendants onto a stack, then visit a popped node before moving to its right child.",
    hint: "When the current pointer becomes null, the stack tells you which ancestor to visit next.",
    complexity: "O(n) time and O(h) auxiliary space, where h is the tree height.",
    statement:
      "Given the root of a binary tree, produce the sequence obtained by fully visiting each left subtree, then its root, and then its right subtree.",
    requirements: [
      "Return an array of node values in inorder sequence.",
      "Return an empty array for an empty tree.",
      "Visit each node exactly once.",
    ],
  },
  104: {
    title: "Maximum Depth of Binary Tree",
    topic: "Binary Tree",
    summary: "Find the number of nodes on the longest path from the root down to a leaf.",
    example: "root = [3,9,20,null,null,15,7] → 3",
    method: "Recursively compute both subtree depths and add one to the larger result.",
    hint: "Treat an empty subtree as having depth zero.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "Given a binary tree, measure its maximum depth. Depth is counted in nodes, beginning with the root and ending at the farthest leaf.",
    requirements: [
      "Return a nonnegative integer depth.",
      "An empty tree has depth 0, and a single-node tree has depth 1.",
      "Either recursive DFS or level-order BFS is acceptable.",
    ],
  },
  226: {
    title: "Invert Binary Tree",
    topic: "Binary Tree",
    summary: "Mirror a binary tree by swapping the left and right child of every node.",
    example: "root = [4,2,7,1,3,6,9] → [4,7,2,9,6,3,1]",
    method: "Invert both subtrees recursively and exchange their returned roots.",
    hint: "Every node performs the same local operation: swap its two children.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "Transform the given binary tree into its mirror image and return the root of the transformed tree.",
    requirements: [
      "Swap left and right children at every node.",
      "Preserve every original node and value.",
      "Return null when the input root is null.",
    ],
  },
  101: {
    title: "Symmetric Tree",
    topic: "Binary Tree",
    summary: "Decide whether the left and right sides of a binary tree are mirror images.",
    example: "root = [1,2,2,3,4,4,3] → true",
    method:
      "Compare nodes in mirrored pairs: outer children together and inner children together.",
    hint: "Mirror comparison crosses directions: left.left matches right.right.",
    complexity: "O(n) time and O(h) recursion space, or O(w) queue space with BFS.",
    statement:
      "Given the root of a binary tree, return whether reflecting the tree across a vertical line through the root would leave its structure and values unchanged.",
    requirements: [
      "Matching mirror positions must either both be absent or contain equal values.",
      "An empty tree is symmetric.",
      "Return a boolean.",
    ],
  },
  543: {
    title: "Diameter of Binary Tree",
    topic: "Binary Tree",
    summary: "Find the greatest number of edges on a path between any two tree nodes.",
    example: "root = [1,2,3,4,5] → 3",
    method:
      "Use postorder traversal to compute subtree heights, updating a global best with left height plus right height at each node.",
    hint: "The longest path may pass through a node other than the root.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "For a binary tree, determine its diameter: the length in edges of the longest simple path connecting any pair of nodes.",
    requirements: [
      "The path may or may not include the root.",
      "Count edges rather than nodes in the returned length.",
      "A tree with zero or one node has diameter 0.",
    ],
  },
  102: {
    title: "Binary Tree Level Order Traversal",
    topic: "Binary Tree",
    summary: "Collect binary-tree values one depth level at a time from top to bottom.",
    example: "root = [3,9,20,null,null,15,7] → [[3],[9,20],[15,7]]",
    method:
      "Run breadth-first search with a queue and process exactly the queue length captured at the beginning of each level.",
    hint: "Nodes added during a round belong to the next level, not the current one.",
    complexity: "O(n) time and O(w) space, where w is the maximum tree width.",
    statement:
      "Given a binary tree, return its values grouped by depth. Within each group, preserve left-to-right order.",
    requirements: [
      "Return an array of arrays, one inner array per nonempty level.",
      "List the root level first.",
      "Return an empty array for an empty tree.",
    ],
  },
  108: {
    title: "Convert Sorted Array to Binary Search Tree",
    topic: "Binary Tree",
    summary: "Turn a strictly increasing array into a height-balanced binary search tree.",
    example: "nums = [-10,-3,0,5,9] → a balanced BST containing the same values",
    method:
      "Choose a middle element as the root and recursively build the two halves as left and right subtrees.",
    hint: "Picking a midpoint keeps the two subtree sizes as close as possible.",
    complexity: "O(n) time and O(log n) recursion space for the balanced construction.",
    statement:
      "Given values already sorted in ascending order, construct and return any binary search tree whose height is balanced and whose inorder traversal reproduces the input.",
    requirements: [
      "Every array value must appear exactly once in the tree.",
      "For every node, the heights of its subtrees must differ by at most one.",
      "Either middle element may be chosen when a segment has even length.",
    ],
  },
  98: {
    title: "Validate Binary Search Tree",
    topic: "Binary Tree",
    summary: "Check whether every node obeys the strict ordering rules of a binary search tree.",
    example: "root = [2,1,3] → true",
    method:
      "Carry an exclusive lower and upper bound through DFS and reject any node outside its allowed interval.",
    hint: "A node is constrained by all of its ancestors, not just by its parent.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "Determine whether a binary tree is a valid BST: all values in each left subtree must be smaller than its root, and all values in each right subtree must be larger.",
    requirements: [
      "Use strict comparisons; equal values do not satisfy the BST rule.",
      "Apply each ancestor's bound throughout the corresponding subtree.",
      "An empty tree is valid.",
    ],
  },
  230: {
    title: "Kth Smallest Element in a BST",
    topic: "Binary Tree",
    summary: "Return the value ranked kth when the nodes of a binary search tree are sorted.",
    example: "root = [3,1,4,null,2], k = 1 → 1",
    method: "Perform inorder traversal and stop as soon as the kth node is visited.",
    hint: "Inorder traversal of a BST yields values in ascending order.",
    complexity: "O(h + k) time with early stopping and O(h) auxiliary space.",
    statement:
      "Given a binary search tree and a 1-based rank k, find the value that occupies position k in ascending order.",
    requirements: [
      "Assume 1 <= k <= the number of tree nodes.",
      "Return a node value, not a node object.",
      "Avoid storing the full traversal when early termination is possible.",
    ],
  },
  199: {
    title: "Binary Tree Right Side View",
    topic: "Binary Tree",
    summary: "Report the node visible from the right side at each depth of a binary tree.",
    example: "root = [1,2,3,null,5,null,4] → [1,3,4]",
    method: "Use level-order traversal and keep the last node processed on every level.",
    hint: "A right-first DFS also works: record only the first node reached at a new depth.",
    complexity: "O(n) time and O(w) BFS space, or O(h) DFS stack space.",
    statement:
      "Imagine standing to the right of a binary tree. Return, from top to bottom, the value of the rightmost node visible at every occupied depth.",
    requirements: [
      "Return one value for each nonempty level.",
      "Order the result from the root level downward.",
      "Return an empty array when the tree is empty.",
    ],
  },
  114: {
    title: "Flatten Binary Tree to Linked List",
    topic: "Binary Tree",
    summary: "Rewire a binary tree in place into a right-only chain following preorder traversal.",
    example: "root = [1,2,5,3,4,null,6] → 1→2→3→4→5→6",
    method:
      "Traverse in reverse preorder (right, left, root), making each node point right to the previously processed node.",
    hint: "After flattening, every left pointer must be null.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "Modify the supplied binary tree so that its nodes form a single chain through right pointers in root-left-right preorder.",
    requirements: [
      "Perform the transformation in place and keep the original node objects.",
      "Set every left child pointer to null.",
      "The right-pointer sequence must equal the original preorder traversal.",
    ],
  },
  105: {
    title: "Construct Binary Tree from Preorder and Inorder Traversal",
    topic: "Binary Tree",
    summary: "Rebuild a binary tree from matching preorder and inorder value sequences.",
    example: "preorder = [3,9,20,15,7], inorder = [9,3,15,20,7] → [3,9,20,null,null,15,7]",
    method:
      "Take the next preorder value as the root, locate it in inorder with a lookup map, and recursively build the two inorder ranges.",
    hint: "The root's inorder position determines exactly how many nodes belong to the left subtree.",
    complexity: "O(n) time and O(n) space including the index map and recursion.",
    statement:
      "Two arrays describe the preorder and inorder traversals of the same binary tree. Reconstruct that tree and return its root.",
    requirements: [
      "The arrays have the same length and contain the same distinct values.",
      "Preserve both traversal orders in the reconstructed tree.",
      "Return null for two empty arrays.",
    ],
  },
  437: {
    title: "Path Sum III",
    topic: "Binary Tree",
    summary: "Count downward tree paths whose node values add up to a target.",
    example: "root = [10,5,-3,3,2,null,11,3,-2,null,1], targetSum = 8 → 3",
    method:
      "During DFS, track the current prefix sum and count how often currentSum - targetSum has appeared on the active root path.",
    hint: "Remove a prefix-sum count when backtracking so sibling branches do not share path history.",
    complexity: "O(n) time and O(h) active-path space, with up to O(n) map entries.",
    statement:
      "Given a binary tree and a target total, count all nonempty paths that move only from parent to child and whose values sum to the target. A path may begin and end at any nodes.",
    requirements: [
      "Count paths rather than distinct sums or node sets.",
      "Each path must follow downward child links without skipping nodes.",
      "Support negative, zero, and positive node values.",
    ],
  },
  236: {
    title: "Lowest Common Ancestor of a Binary Tree",
    topic: "Binary Tree",
    summary: "Find the deepest node that is an ancestor of two specified nodes.",
    example: "root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1 → 3",
    method:
      "Search both subtrees recursively; when p and q are found on opposite sides, the current node is their lowest common ancestor.",
    hint: "If the current node is p or q, return it to the caller immediately.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "Given a binary tree and references to two nodes in it, return their lowest common ancestor: the common ancestor located farthest from the root.",
    requirements: [
      "Treat a node as an ancestor of itself.",
      "Assume p and q are distinct and both occur in the tree.",
      "Return the matching node object, not only its value.",
    ],
  },
  124: {
    title: "Binary Tree Maximum Path Sum",
    topic: "Binary Tree",
    summary: "Find the largest value sum obtainable along any non-repeating path in a binary tree.",
    example: "root = [-10,9,20,null,null,15,7] → 42",
    method:
      "In postorder, compute the best one-branch gain each node can offer its parent while updating a global answer with both positive child gains.",
    hint: "Discard a negative child contribution, and remember that only one child branch can continue upward.",
    complexity: "O(n) time and O(h) recursion space.",
    statement:
      "A path may start and finish at any nodes but must follow tree edges and visit no node twice. Return the maximum possible sum of values on such a nonempty path.",
    requirements: [
      "The path does not have to include the root or a leaf.",
      "At least one node must be included, even when all values are negative.",
      "Return the maximum sum as an integer.",
    ],
  },
  200: {
    title: "Number of Islands",
    topic: "Graph",
    summary: "Count connected groups of land in a grid using four-directional adjacency.",
    example: "grid = [\"11000\",\"11000\",\"00100\",\"00011\"] → 3",
    method:
      "Scan every cell; on each unseen land cell, increment the answer and use DFS or BFS to mark its entire component.",
    hint: "Mark land when it is discovered so the same cell is never added twice.",
    complexity: "O(mn) time and up to O(mn) auxiliary space.",
    statement:
      "A rectangular grid contains water and land cells. Two land cells belong to the same island when they connect through horizontal or vertical land steps. Return the number of separate islands.",
    requirements: [
      "Do not connect cells diagonally.",
      "Count each connected land component exactly once.",
      "You may mark the input grid in place if desired.",
    ],
  },
  994: {
    title: "Rotting Oranges",
    topic: "Graph",
    summary: "Compute how many minutes simultaneous four-way spreading needs to rot every fresh orange.",
    example: "grid = [[2,1,1],[1,1,0],[0,1,1]] → 4",
    method:
      "Start a multi-source BFS with every rotten orange and process the queue in minute-sized layers.",
    hint: "Track how many fresh oranges remain; if the count never reaches zero, return -1.",
    complexity: "O(mn) time and O(mn) queue space.",
    statement:
      "Grid cells are empty, fresh, or rotten. Each minute, every rotten orange simultaneously rots its fresh horizontal and vertical neighbors. Return the earliest minute when no fresh orange remains.",
    requirements: [
      "Return 0 when the grid starts with no fresh oranges.",
      "Return -1 if at least one fresh orange can never be reached.",
      "Treat all initially rotten oranges as starting sources at minute 0.",
    ],
  },
  207: {
    title: "Course Schedule",
    topic: "Graph",
    summary: "Determine whether all courses can be completed without a cyclic prerequisite chain.",
    example: "numCourses = 2, prerequisites = [[1,0]] → true",
    method:
      "Build the directed prerequisite graph and run Kahn's topological sort from all zero-indegree courses.",
    hint: "If fewer than numCourses nodes leave the queue, the remaining nodes are trapped in a cycle.",
    complexity: "O(V + E) time and O(V + E) space.",
    statement:
      "Courses are numbered from 0 through numCourses - 1. Each pair [course, prerequisite] means the prerequisite must be completed first. Decide whether there is an ordering that completes every course.",
    requirements: [
      "Return true exactly when the prerequisite graph is acyclic.",
      "Include courses with no prerequisite edges in the decision.",
      "You may use topological sorting or directed-cycle detection.",
    ],
  },
  208: {
    title: "Implement Trie (Prefix Tree)",
    topic: "Graph",
    summary: "Implement a data structure that stores words and answers exact-word and prefix queries.",
    example: "insert(\"apple\"); search(\"apple\") → true; startsWith(\"app\") → true",
    method:
      "Represent each trie node with a child mapping and an end-of-word flag, then walk one character per level.",
    hint: "Reaching the last character proves a prefix exists; an exact search must also see an end marker.",
    complexity: "O(L) time per operation; O(total inserted characters) space.",
    statement:
      "Create a Trie class supporting insertion of a word, testing whether a complete word was inserted, and testing whether any inserted word begins with a supplied prefix.",
    requirements: [
      "Implement Trie(), insert(word), search(word), and startsWith(prefix).",
      "search must distinguish a complete stored word from a path that is only a prefix.",
      "Operations should process each input character once.",
    ],
  },
  46: {
    title: "Permutations",
    topic: "Backtracking",
    summary: "Generate every ordering of an array whose values are distinct.",
    example: "nums = [1,2,3] → 6 permutations",
    method:
      "Build one ordering at a time, choosing an unused value for the next position and undoing that choice on return.",
    hint: "A path becomes a complete permutation when its length equals nums.length.",
    complexity: "O(n * n!) time including output construction and O(n) search-path space.",
    statement:
      "Given an array of distinct integers, return all possible arrays formed by rearranging every input element exactly once.",
    requirements: [
      "Each result must contain all input values exactly once.",
      "Return all n! distinct orderings.",
      "The order in which permutations are returned does not matter.",
    ],
  },
  78: {
    title: "Subsets",
    topic: "Backtracking",
    summary: "Return the complete power set of an array containing distinct values.",
    example: "nums = [1,2,3] → 8 subsets including [] and [1,2,3]",
    method:
      "At each position, either include the value or skip it; record the current path at every search node.",
    hint: "The empty selection is a valid subset and must appear in the result.",
    complexity: "O(n * 2^n) time to copy the output and O(n) search-path space.",
    statement:
      "Given distinct integers, produce every selection that can be made from them, from selecting nothing through selecting the entire array.",
    requirements: [
      "Include exactly 2^n subsets.",
      "Do not return duplicate subsets.",
      "The order of subsets and the order of values within them are not significant.",
    ],
  },
  17: {
    title: "Letter Combinations of a Phone Number",
    topic: "Backtracking",
    summary: "Expand a digit string into all letter strings allowed by a telephone keypad.",
    example: "digits = \"23\" → [\"ad\",\"ae\",\"af\",\"bd\",\"be\",\"bf\",\"cd\",\"ce\",\"cf\"]",
    method:
      "Process digits from left to right, recursively appending each letter mapped to the current digit.",
    hint: "Handle an empty digit string before starting backtracking.",
    complexity: "O(n * 4^n) time including result strings and O(n) search-path space.",
    statement:
      "Digits 2 through 9 map to their usual phone-keypad letters. Given a string of those digits, return every letter string formed by choosing one mapped letter for each position.",
    requirements: [
      "Preserve the input digit order in every generated string.",
      "Return an empty array when digits is empty.",
      "Return each possible combination once; result order is unrestricted.",
    ],
  },
  39: {
    title: "Combination Sum",
    topic: "Backtracking",
    summary: "Find unique combinations of reusable candidate numbers that add to a target.",
    example: "candidates = [2,3,6,7], target = 7 → [[2,2,3],[7]]",
    method:
      "Backtrack from a nondecreasing candidate index; after choosing a value, keep the same index so it may be chosen again.",
    hint: "Sorting candidates lets you stop a branch when the next value exceeds the remaining total.",
    complexity: "Output-dependent exponential time and O(target / min(candidates)) path space.",
    statement:
      "Given distinct positive candidate integers and a positive target, return every distinct multiset of candidates whose sum is exactly the target. A candidate may be used repeatedly.",
    requirements: [
      "Combinations that differ only in order count as the same answer.",
      "Each candidate may appear any nonnegative number of times.",
      "Return all valid combinations and no invalid partial paths.",
    ],
  },
  22: {
    title: "Generate Parentheses",
    topic: "Backtracking",
    summary: "Generate all balanced strings containing exactly n pairs of parentheses.",
    example: "n = 3 → [\"((()))\",\"(()())\",\"(())()\",\"()(())\",\"()()()\"]",
    method:
      "Add an opening parenthesis while any remain, and add a closing one only when it would not outnumber openings in the current prefix.",
    hint: "A valid prefix never contains more closing than opening parentheses.",
    complexity: "O(Cn * n) output time, where Cn is the nth Catalan number, and O(n) path space.",
    statement:
      "For a positive integer n, return every distinct well-formed parentheses string that uses n opening and n closing symbols.",
    requirements: [
      "Every returned string must have length 2n.",
      "Every prefix must have at least as many opening as closing parentheses.",
      "Return every valid arrangement exactly once.",
    ],
  },
  79: {
    title: "Word Search",
    topic: "Backtracking",
    summary: "Determine whether a word can be traced through adjacent cells of a character board.",
    example: "board = [ABCE,SFCS,ADEE], word = \"ABCCED\" → true",
    method:
      "Start DFS from each matching first letter, temporarily mark a chosen cell, and backtrack after exploring its neighbors.",
    hint: "Restore a cell after a failed path so another starting route can use it.",
    complexity: "Worst-case O(mn * 4^L) time and O(L) recursion space for word length L.",
    statement:
      "Given a rectangular letter board and a word, decide whether the word can be formed by moving horizontally or vertically between consecutive matching cells.",
    requirements: [
      "Match the word's characters in their given order.",
      "A board cell may be used at most once within one path.",
      "Diagonal moves and wraparound moves are not allowed.",
    ],
  },
  131: {
    title: "Palindrome Partitioning",
    topic: "Backtracking",
    summary: "List every way to split a string into pieces that are all palindromes.",
    example: "s = \"aab\" → [[\"a\",\"a\",\"b\"],[\"aa\",\"b\"]]",
    method:
      "Try every possible next endpoint and recurse only when the selected substring reads the same in both directions.",
    hint: "When the start index reaches the end of the string, the current partition is complete.",
    complexity: "Worst-case O(n * 2^n) time including output and O(n) search-path space.",
    statement:
      "Split the input string at zero or more positions. Return all complete partitions for which every resulting substring is a palindrome.",
    requirements: [
      "Every partition must concatenate back to the original string.",
      "Every piece must be nonempty and palindromic.",
      "Return all valid partitions; their order does not matter.",
    ],
  },
  51: {
    title: "N-Queens",
    topic: "Backtracking",
    summary: "Place n queens on an n-by-n board so that no pair can attack each other.",
    example: "n = 4 → 2 valid board layouts",
    method:
      "Place one queen per row while sets track occupied columns and both diagonal directions.",
    hint: "Cells share diagonals when row - column or row + column is equal.",
    complexity: "Approximately O(n!) search time and O(n) auxiliary search state, excluding output.",
    statement:
      "Return every distinct arrangement of n queens on an n-by-n chessboard in which no two queens share a row, column, or diagonal.",
    requirements: [
      "Represent each board as n strings using 'Q' for a queen and '.' for an empty square.",
      "Place exactly one queen in every row and every column.",
      "Return all valid layouts in any order.",
    ],
  },
  35: {
    title: "Search Insert Position",
    topic: "Binary Search",
    summary: "Find a target's index in a sorted array, or the index where it should be inserted.",
    example: "nums = [1,3,5,6], target = 5 → 2",
    method: "Use binary search to find the first position whose value is at least the target.",
    hint: "With a half-open interval, left is the insertion point when the loop ends.",
    complexity: "O(log n) time and O(1) space.",
    statement:
      "Given a strictly increasing integer array and a target, return the target's current index. If it is absent, return the index that would preserve sorted order after insertion.",
    requirements: [
      "Return an index from 0 through nums.length.",
      "Do not modify the input array.",
      "Use an O(log n) search.",
    ],
  },
  74: {
    title: "Search a 2D Matrix",
    topic: "Binary Search",
    summary: "Search a matrix whose rows together form one increasing sequence.",
    example: "matrix = [[1,3,5,7],[10,11,16,20],[23,30,34,60]], target = 3 → true",
    method:
      "Treat the m-by-n matrix as a virtual sorted array and convert each binary-search index with row = index / n and column = index % n.",
    hint: "The first element of each row comes after every value in the preceding row.",
    complexity: "O(log(mn)) time and O(1) space.",
    statement:
      "Given a nonempty matrix with increasing rows, where each row begins above the previous row's final value, return whether a target integer appears in the matrix.",
    requirements: [
      "Return a boolean without changing the matrix.",
      "Use the global sorted ordering across row boundaries.",
      "Aim for logarithmic time in the total number of cells.",
    ],
  },
  34: {
    title: "Find First and Last Position of Element in Sorted Array",
    topic: "Binary Search",
    summary: "Locate the inclusive range occupied by a target value in a sorted array.",
    example: "nums = [5,7,7,8,8,10], target = 8 → [3,4]",
    method:
      "Run two boundary searches: one for the first value at least target and one for the first value greater than target.",
    hint: "The final index is upperBound(target) - 1, provided the target actually exists.",
    complexity: "O(log n) time and O(1) space.",
    statement:
      "Given a nondecreasing integer array, return the first and last indexes at which target occurs. If target does not occur, return [-1, -1].",
    requirements: [
      "Return exactly two indexes in inclusive [first, last] form.",
      "Handle one occurrence, many occurrences, and no occurrence.",
      "Use O(log n) time rather than scanning outward linearly.",
    ],
  },
  33: {
    title: "Search in Rotated Sorted Array",
    topic: "Binary Search",
    summary: "Find a target in a distinct-value sorted array that may have been rotated.",
    example: "nums = [4,5,6,7,0,1,2], target = 0 → 4",
    method:
      "At each midpoint identify the sorted half, then keep it only if its value range can contain the target.",
    hint: "Comparing nums[left] with nums[mid] reveals whether the left half is sorted.",
    complexity: "O(log n) time and O(1) space.",
    statement:
      "A strictly increasing array was cyclically shifted at an unknown position. Given this array and a target, return the target's index or -1 when it is absent.",
    requirements: [
      "All array values are distinct.",
      "Return the index in the supplied rotated array.",
      "Maintain logarithmic search time.",
    ],
  },
  153: {
    title: "Find Minimum in Rotated Sorted Array",
    topic: "Binary Search",
    summary: "Return the smallest value in a rotated array of distinct increasing values.",
    example: "nums = [3,4,5,1,2] → 1",
    method:
      "Compare the midpoint with the right endpoint; a larger midpoint places the minimum to its right, otherwise keep the midpoint in the left search region.",
    hint: "When mid may itself be the answer, update right to mid rather than mid - 1.",
    complexity: "O(log n) time and O(1) space.",
    statement:
      "A nonempty strictly increasing array has been rotated some number of positions, possibly zero. Find and return its minimum element.",
    requirements: [
      "Assume every value is unique.",
      "Handle both rotated and already sorted inputs.",
      "Use logarithmic time without modifying the array.",
    ],
  },
};
