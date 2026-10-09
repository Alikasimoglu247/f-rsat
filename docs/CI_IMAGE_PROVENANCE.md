# CI image provenance and Docker Hub quota

The acceptance job keeps its PostgreSQL, unit, integration, browser, image-build,
and separate-container encrypted-token persistence checks. It does not log in to
an external account, publish an image, or deploy the application.

The shared GitHub runner's unauthenticated Docker Hub pull quota previously
stopped the PostgreSQL service before any tests could run. PostgreSQL and the
Node build base now use Docker Official Images distributed in AWS ECR Public.
AWS documents this official distribution here:

<https://aws.amazon.com/blogs/containers/docker-official-images-now-available-on-amazon-elastic-container-registry-public/>

Both multi-platform OCI indexes were retrieved through verified HTTPS from
Docker Hub and ECR Public on 2026-10-10 (Europe/Istanbul). The raw manifest hashes
matched across the two registries:

| Image tag | SHA-256 OCI index digest |
| --- | --- |
| `postgres:17.9` | `2a0d0fe14825b0939f78a8cad5cd4e6aa68bf94d0e5dd96e24b6d23af4315545` |
| `node:24-bookworm` | `3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0` |

The workflow, local Compose database, and Dockerfile pin these digests. This is
the same image content, with a different official registry endpoint. It does
not replace npm dependencies, change `package-lock.json`, disable TLS, skip
tests, or add an untrusted registry. Builds still use `npm ci`.

The research worker uses `pdftotext` to read TCMB's published housing-index PDF.
The image installs Debian's `poppler-utils` from the official Debian package
repositories with signature verification and no recommended packages, then
clears apt lists. Its optional managed-proxy CA is supplied as a build secret
and is not copied into the image. The application still runs as the `node` user.

When upgrading a base image, review the desired upstream release, check its
official registry provenance and manifest digest, and update the pins together.
A digest pin prevents silent tag changes; it still requires deliberate security
updates. ECR Public also has service quotas and can be unavailable. A registry
failure must fail CI visibly; there is no automatic fallback to an unreviewed
mirror. A successful manifest read is not a successful CI run or image build.

Local validation on 2026-10-10:

- Both pinned ECR images were actually pulled by Docker.
- The PostgreSQL image ran `postgres --version` with networking disabled:
  PostgreSQL 17.9.
- The Node base plus the Dockerfile's apt-install step built successfully using
  the inherited proxy and a build-secret CA bundle.
- The resulting container ran as `node` with networking disabled: Node 24.21.0,
  Poppler 22.12.0. It extracted the actual TCMB August 2026 PDF, including its
  housing-index heading and Istanbul's 26.3% annual index change. Apt lists and
  the temporary CA configuration were absent afterward.
- Compose configuration, workflow YAML, retained acceptance steps, and blocking
  failures were checked.

These checks validate the registry change and PDF runtime dependency. The full
application build, acceptance suite, and encrypted-token runtime check remain
mandatory in GitHub CI for the resulting commit.
