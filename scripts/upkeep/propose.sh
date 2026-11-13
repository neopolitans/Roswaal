#!/usr/bin/env bash
# The Upkeep workflow's way of handing over a change: apply the patch the
# job that did the work left, commit it to a branch of its own, and open a
# pull request for a person to read and merge. Where the repository does not
# let Actions open pull requests (Settings > Actions > General), it opens an
# issue linking the branch instead. Never a push to main.
#
#   propose.sh <branch> <title> <change dir> <allowed path>...
#
# <change dir> holds change.patch and body.md. The patch was made by a job
# that installed packages, so it is read as untrusted: a path it touches that
# is not one of the allowed ones -- a file, or a folder ending in / -- stops
# everything before anything is applied. Needs GH_TOKEN, and a checkout whose
# credentials can push.
set -euo pipefail

branch="$1"
title="$2"
change="$3"
shift 3
patch="$change/change.patch"
body="$change/body.md"

allowed() {
	local file="$1" path
	for path in "${ALLOWED[@]}"; do
		if [[ "$path" == */ ]]; then
			[[ "$file" == "$path"* ]] && return 0
		else
			[[ "$file" == "$path" ]] && return 0
		fi
	done
	return 1
}
ALLOWED=("$@")

touched=$(git apply --numstat "$patch" | cut -f3)
if [ -z "$touched" ]; then
	echo "The patch changes nothing." >&2
	exit 1
fi
while IFS= read -r file; do
	case "$file" in
		*..*) echo "::error::The patch names $file, which climbs out of where it may write." >&2; exit 1 ;;
	esac
	if ! allowed "$file"; then
		echo "::error::The patch changes $file, which this job may not: only ${ALLOWED[*]}." >&2
		exit 1
	fi
done <<<"$touched"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -B "$branch"
git apply --index "$patch"
git commit --quiet -m "$title"
# The branch is the workflow's own, rebuilt from main each week.
git push --force --quiet origin "$branch"

open_pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
if [ -n "$open_pr" ]; then
	gh pr edit "$open_pr" --title "$title" --body-file "$body"
	echo "Updated pull request #$open_pr."
	exit 0
fi
if gh pr create --base main --head "$branch" --title "$title" --body-file "$body"; then
	exit 0
fi

compare="https://github.com/${GITHUB_REPOSITORY}/compare/main...${branch}"
note=$(mktemp)
{
	echo "Actions may not open pull requests in this repository, so this change is on a branch: [${branch}](${compare})."
	echo
	cat "$body"
} >"$note"
open_issue=$(gh issue list --state open --search "in:title \"$title\"" --json number,title --jq ".[] | select(.title == \"$title\") | .number" | head -n 1)
if [ -n "$open_issue" ]; then
	gh issue edit "$open_issue" --body-file "$note"
	echo "Updated issue #$open_issue."
else
	gh issue create --title "$title" --body-file "$note"
fi
