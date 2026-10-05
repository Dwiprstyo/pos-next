#!/usr/bin/env bash
# Apple Silicon workaround: the arm64 Supabase images for storage-api, postgres-meta
# and kong ship a 0-byte docker-entrypoint.sh, which makes `supabase start` fail with
# "exec /usr/local/bin/docker-entrypoint.sh: exec format error".
#
# This script extracts the real entrypoint from the amd64 image and rebuilds the
# local arm64 tag. Run once before `npm run db:start`.
set -euo pipefail

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

patch() {
  local image="$1" entrypoint="$2" file="$3"

  echo "Patching $image"
  docker pull --platform linux/amd64 "public.ecr.aws/supabase/$image" >/dev/null

  local container
  container="$(docker create --platform linux/amd64 "public.ecr.aws/supabase/$image")"
  docker cp "$container:$entrypoint" "$WORKDIR/$file"
  docker rm "$container" >/dev/null

  cat > "$WORKDIR/Dockerfile" <<EOF
FROM public.ecr.aws/supabase/$image
USER root
COPY $file $entrypoint
RUN chmod +x $entrypoint
EOF

  docker build -f "$WORKDIR/Dockerfile" -t "public.ecr.aws/supabase/$image" "$WORKDIR" >/dev/null
}

patch "storage-api:v1.72.1" "/usr/local/bin/docker-entrypoint.sh" "storage-entrypoint.sh"
patch "postgres-meta:v0.99.0" "/usr/local/bin/docker-entrypoint.sh" "meta-entrypoint.sh"
patch "kong:2.8.1" "/docker-entrypoint.sh" "kong-entrypoint.sh"

echo "Done. You can now run: npm run db:start"
