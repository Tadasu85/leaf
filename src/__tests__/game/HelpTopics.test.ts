import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';
import { findHelpTopic, helpIndexLine, HELP_TOPICS, TOPIC_NAMES } from '../../game/help/topics';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

describe('help topics', () => {
  it('finds topics by name and by command', () => {
    expect(findHelpTopic('talking')).toBe(HELP_TOPICS.talking);
    expect(findHelpTopic('PAGE')).toBe(HELP_TOPICS.talking);
    expect(findHelpTopic('eject')).toBe(HELP_TOPICS.people);
    expect(findHelpTopic('nonsense')).toBeNull();
  });

  it('lists every topic in the index line', () => {
    for (const name of TOPIC_NAMES) expect(helpIndexLine()).toContain(name);
  });

  it('parses help with and without a topic', () => {
    expect(new CommandParser().parse('help')).toMatchObject({ type: 'help', args: [] });
    expect(new CommandParser().parse('help Building')).toMatchObject({ type: 'help', args: ['building'] });
  });

  it('shows a topic, and says when there is none', () => {
    const gameState = new GameState(new EventEmitter() as any, new EventEmitter() as any);
    gameState.helpTopic('guests');
    const out = gameState.getOutputMessages().map(m => m.output);
    expect(out).toContain('\nPlaying as a guest');
    expect(out).toEqual(expect.arrayContaining(HELP_TOPICS.guests.lines));
    gameState.helpTopic('dragons');
    expect(gameState.getOutputMessages().map(m => m.output)).toContain(`There's no help on "dragons". ${helpIndexLine()}`);
  });
});
