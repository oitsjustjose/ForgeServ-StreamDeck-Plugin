import streamDeck, {
  action,
  DialAction,
  DialRotateEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";

const safeCastToInt = (value: string): number => {
  const tmp = parseInt(value);
  if (Number.isNaN(tmp)) return 0;
  return tmp;
};

class SingleDialProcessor {
  private settings: SelectServerSettings;
  private action: DialAction;

  /* What index we're currently on based on the dial's rotation */
  private currentIndexOverride: number = -1;

  /* The ID assigned by the last setTimeout() calls for process() and rerender() */
  private resetIndexTimeoutId: NodeJS.Timeout | undefined = undefined;

  constructor(action: DialAction, settings: SelectServerSettings) {
    this.action = action;
    this.settings = settings;
  }

  getEffectiveIndex(): number {
    return this.currentIndexOverride >= 0
      ? this.currentIndexOverride
      : this.settings!.serverIndex;
  }

  public async render(servers: Server[]) {
    const index = this.getEffectiveIndex();
    const server = servers[index];
    if (!server) return;

    await this.action.setFeedback({
      title: server.name,
      value:
        server.players.length === 0
          ? "Empty"
          : `${server.players.length} of ${server.max}`,
      icon: `data:image/png;base64,${server.icon}`,
    });
  }

  public onRotate(
    evt: DialRotateEvent<SelectServerSettingsRaw>,
    servers: Server[]
  ) {
    function wrap(index: number): number {
      const end = servers.length - 1;
      return index > end ? 0 : index < 0 ? end : index;
    }

    this.reset(); // Reset the existing timeout or else we'll be stuck in a hell loop
    this.currentIndexOverride = wrap(
      this.getEffectiveIndex() + evt.payload.ticks
    );

    this.render(servers);
    this.resetIndexTimeoutId = setTimeout(async () => {
      this.currentIndexOverride = -1;
      this.resetIndexTimeoutId = undefined;
      await this.render(servers);
    }, 1000 * this.settings.resetTimeout);
  }

  public reset() {
    !!this.resetIndexTimeoutId && clearTimeout(this.resetIndexTimeoutId);
  }
}

@action({ UUID: "net.forgeserv.api.action" })
export class SelectServerAction extends SingletonAction<SelectServerSettingsRaw> {
  private readonly serverRefreshMs: number = 1000;
  private serverFetchTimeoutId: NodeJS.Timeout | undefined = undefined;

  servers: Server[] = [];
  processors: { [key: string]: SingleDialProcessor } = {};

  private async getServers(): Promise<boolean> {
    try {
      const resp = await fetch("https://api.forgeserv.net");

      if (resp.ok) {
        this.servers = (await resp.json()) as Server[];
      }

      this.serverFetchTimeoutId = setTimeout(
        () => this.getServers(),
        this.serverRefreshMs
      );

      await Promise.all(
        Object.values(this.processors).map((x) => x.render(this.servers))
      );

      return true;
    } catch {
      /* Retry but with a 2x delay */
      this.serverFetchTimeoutId = setTimeout(
        () => this.getServers(),
        this.serverRefreshMs * 2
      );

      return false;
    }
  }

  private makeKey(coordinates: Coordinates): string {
    return `row=${coordinates.row},col=${coordinates.column}`;
  }

  /**************************************************************************************************
                                                EVENTS                                              
  ***************************************************************************************************/

  override async onWillAppear(evt: WillAppearEvent<SelectServerSettingsRaw>) {
    if (!evt.action.isDial()) return;

    await this.getServers();

    const settings = {
      serverIndex: safeCastToInt(evt.payload.settings.serverIndex),
      refreshFrequency: safeCastToInt(evt.payload.settings.refreshFrequency),
      resetTimeout: safeCastToInt(evt.payload.settings.resetTimeout),
    };

    const key = this.makeKey(evt.payload.coordinates as Coordinates);
    this.processors[key] = new SingleDialProcessor(evt.action, settings);
    this.processors[key].render(this.servers);
  }

  override async onWillDisappear(
    _: WillDisappearEvent<SelectServerSettingsRaw>
  ) {
    Object.values(this.processors).forEach((x) => x.reset());
    !!this.serverFetchTimeoutId && clearTimeout(this.serverFetchTimeoutId);
  }

  override async onDialRotate(evt: DialRotateEvent<SelectServerSettingsRaw>) {
    if (!evt.action.isDial()) return;
    if (!evt.payload || !evt.payload.ticks) return;

    if (!this.servers.length) {
      const success = await this.getServers();
      if (!success) return;
    }

    const key = this.makeKey(evt.payload.coordinates as Coordinates);
    if (!Object.keys(this.processors).includes(key)) {
      streamDeck.logger.error(`Failed to get processor for ${key}`);
      return;
    }

    this.processors[key].onRotate(evt, this.servers);
  }
}

type Coordinates = {
  column: number;
  row: number;
};

type Server = {
  dynamp: string | null;
  health: string;
  icon: string;

  players: string[];
  online: string;
  max: string;

  motd: string;
  name: string;
  status: string;
  type: string;
  version: string;
};

type SelectServerSettingsRaw = {
  serverIndex: string /* What ID to reset to */;
  refreshFrequency: string /* How often should we poll for updates? */;
  resetTimeout: string /* After how many seconds should we reset? */;
};

type SelectServerSettings = {
  serverIndex: number /* What ID to reset to */;
  refreshFrequency: number /* How often should we poll for updates? */;
  resetTimeout: number /* After how many seconds should we reset? */;
};
