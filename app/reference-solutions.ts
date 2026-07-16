const referenceSolutions: Readonly<Record<number, string>> = {
  15: `class Solution:
    def threeSum(self, nums):
        nums.sort()
        answer = []

        for first in range(len(nums) - 2):
            if first > 0 and nums[first] == nums[first - 1]:
                continue

            left, right = first + 1, len(nums) - 1
            while left < right:
                total = nums[first] + nums[left] + nums[right]
                if total < 0:
                    left += 1
                elif total > 0:
                    right -= 1
                else:
                    answer.append([nums[first], nums[left], nums[right]])
                    left += 1
                    right -= 1
                    while left < right and nums[left] == nums[left - 1]:
                        left += 1
                    while left < right and nums[right] == nums[right + 1]:
                        right -= 1

        return answer`,
  167: `class Solution:
    def twoSum(self, numbers, target):
        left, right = 0, len(numbers) - 1

        while left < right:
            total = numbers[left] + numbers[right]
            if total < target:
                left += 1
            elif total > target:
                right -= 1
            else:
                return [left + 1, right + 1]`,
  2824: `class Solution:
    def countPairs(self, nums, target):
        nums.sort()
        left, right = 0, len(nums) - 1
        answer = 0

        while left < right:
            if nums[left] + nums[right] < target:
                answer += right - left
                left += 1
            else:
                right -= 1

        return answer`,
  16: `class Solution:
    def threeSumClosest(self, nums, target):
        nums.sort()
        closest = nums[0] + nums[1] + nums[2]

        for first in range(len(nums) - 2):
            left, right = first + 1, len(nums) - 1
            while left < right:
                total = nums[first] + nums[left] + nums[right]
                if abs(total - target) < abs(closest - target):
                    closest = total

                if total < target:
                    left += 1
                elif total > target:
                    right -= 1
                else:
                    return target

        return closest`,
  18: `class Solution:
    def fourSum(self, nums, target):
        nums.sort()
        answer = []
        size = len(nums)

        for first in range(size - 3):
            if first > 0 and nums[first] == nums[first - 1]:
                continue
            for second in range(first + 1, size - 2):
                if second > first + 1 and nums[second] == nums[second - 1]:
                    continue

                left, right = second + 1, size - 1
                while left < right:
                    total = nums[first] + nums[second] + nums[left] + nums[right]
                    if total < target:
                        left += 1
                    elif total > target:
                        right -= 1
                    else:
                        answer.append([nums[first], nums[second], nums[left], nums[right]])
                        left += 1
                        right -= 1
                        while left < right and nums[left] == nums[left - 1]:
                            left += 1
                        while left < right and nums[right] == nums[right + 1]:
                            right -= 1

        return answer`,
  611: `class Solution:
    def triangleNumber(self, nums):
        nums.sort()
        answer = 0

        for longest in range(len(nums) - 1, 1, -1):
            left, right = 0, longest - 1
            while left < right:
                if nums[left] + nums[right] > nums[longest]:
                    answer += right - left
                    right -= 1
                else:
                    left += 1

        return answer`,
};

export function referenceSolutionFor(problemId: number): string {
  return referenceSolutions[problemId] ?? "";
}

export const animatedReferenceProblemIds = Object.freeze(
  Object.keys(referenceSolutions).map(Number),
);
