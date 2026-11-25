FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
RUN npm run build

FROM swift:6.3-noble AS backend
WORKDIR /build
COPY Package.swift Package.resolved ./
COPY Sources ./Sources
COPY tests ./tests
RUN swift build --build-system native -c release --product App
RUN mkdir /staging && cp .build/release/App /staging/ && find -L .build/release -maxdepth 1 -name '*.resources' -exec cp -R {} /staging/ \;

FROM swift:6.3-noble
WORKDIR /app
COPY --from=backend /staging/ ./
COPY --from=frontend /build/public ./public
RUN useradd --system --uid 10001 vapor
USER vapor
EXPOSE 8080
ENTRYPOINT ["./App"]
CMD ["serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8080"]
