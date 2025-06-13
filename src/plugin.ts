import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { SelectServerAction } from "./actions/action";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.WARN);
streamDeck.actions.registerAction(new SelectServerAction());

// Finally, connect to the Stream Deck.
streamDeck.connect();
