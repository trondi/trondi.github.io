"use client";

import { lazy, Suspense } from "react";

const registry: Record<string, React.LazyExoticComponent<() => React.ReactElement>> = {
  "kubernetes-cluster":    lazy(() => import("./kubernetes-cluster").then((m) => ({ default: m.KubernetesClusterDiagram }))),
  "docker-concepts":       lazy(() => import("./docker-concepts").then((m) => ({ default: m.DockerConceptsDiagram }))),
  "rendering-strategies":  lazy(() => import("./rendering-strategies").then((m) => ({ default: m.RenderingStrategiesDiagram }))),
  "sse-shared-worker":     lazy(() => import("./sse-shared-worker").then((m) => ({ default: m.SseSharedWorkerDiagram }))),
  "jenkins-pipeline":      lazy(() => import("./jenkins-pipeline").then((m) => ({ default: m.JenkinsPipelineDiagram }))),
  "gitlab-jenkins-compare":lazy(() => import("./gitlab-jenkins-compare").then((m) => ({ default: m.GitlabJenkinsCompareDiagram }))),
  "pm2-concepts":          lazy(() => import("./pm2-concepts").then((m) => ({ default: m.Pm2ConceptsDiagram }))),
  "alarm-data-flow":       lazy(() => import("./alarm-data-flow").then((m) => ({ default: m.AlarmDataFlowDiagram }))),
  "alarm-update-strategy": lazy(() => import("./alarm-update-strategy").then((m) => ({ default: m.AlarmUpdateStrategyDiagram }))),
  "alarm-querykey-map":    lazy(() => import("./alarm-querykey-map").then((m) => ({ default: m.AlarmQuerykeyMapDiagram }))),
  "k8s-secret-injection":  lazy(() => import("./k8s-secret-injection").then((m) => ({ default: m.K8sSecretInjectionDiagram }))),
};

export function DiagramBlock({ name }: { name: string }) {
  const Component = registry[name];
  if (!Component) return null;
  return (
    <Suspense fallback={
      <div className="my-2 flex h-40 items-center justify-center rounded-2xl border border-border bg-secondary/30 text-sm text-muted-foreground">
        다이어그램 로딩 중…
      </div>
    }>
      <Component />
    </Suspense>
  );
}
