// O teste negativo precisa capturar o diagnóstico completo do compilador.
// Executá-lo no próprio processo evita o repasse de stderr entre workers.
export default {
  experimental: { webpackBuildWorker: false },
};
