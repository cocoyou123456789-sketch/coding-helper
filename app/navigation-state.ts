export type AppMode = "path" | "workspace" | "course";

export type NavigationState = {
  mode: AppMode;
  problemId?: number;
};

function isProblemId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseNavigationState(
  search: string,
  knownProblemIds: ReadonlySet<number>,
): NavigationState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");

  if (mode !== "workspace" && mode !== "course" && mode !== "path") {
    return { mode: "path" };
  }

  if (mode !== "workspace") {
    return { mode };
  }

  const rawProblemId = params.get("problem");
  if (rawProblemId === null || !/^\d+$/.test(rawProblemId)) {
    return { mode };
  }

  const problemId = Number(rawProblemId);
  return isProblemId(problemId) && knownProblemIds.has(problemId)
    ? { mode, problemId }
    : { mode };
}

export function navigationHref(currentHref: string, state: NavigationState): string {
  const url = new URL(currentHref, "https://navigation.local/");

  if (state.mode === "path") {
    url.searchParams.delete("mode");
    url.searchParams.delete("problem");
  } else if (state.mode === "course") {
    url.searchParams.set("mode", "course");
    url.searchParams.delete("problem");
  } else {
    url.searchParams.set("mode", "workspace");
    if (state.problemId !== undefined && isProblemId(state.problemId)) {
      url.searchParams.set("problem", String(state.problemId));
    } else {
      url.searchParams.delete("problem");
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
