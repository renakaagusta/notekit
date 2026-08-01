declare module "@pyroscope/nodejs" {
  interface PyroscopeConfig {
    serverAddress: string;
    appName: string;
    tags?: Record<string, string>;
  }
  const Pyroscope: {
    init(config: PyroscopeConfig): void;
    start(): void;
    stop(): void;
  };
  export default Pyroscope;
}
