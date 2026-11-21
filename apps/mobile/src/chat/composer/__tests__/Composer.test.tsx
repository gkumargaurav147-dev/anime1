import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { suggestScene, type Scene } from '@anime/scene-engine';
import { Composer, type ComposerProps } from '../Composer';

const DINNER = 'Can we go out for dinner tonight?';
const ME = 'me-1';
const PEER = 'peer-2';

async function setup(over: Partial<ComposerProps> = {}) {
  const onSend = jest.fn<void, [string, Scene | null]>();
  await render(
    <Composer
      mode="on"
      ageBracket="adult"
      myId={ME}
      peerId={PEER}
      onSend={onSend}
      debounceMs={0}
      renderScene={(s) => <Text testID="scene-render">{s.catalog_scene_id}</Text>}
      {...over}
    />,
  );
  return { onSend };
}

const type = (text: string) => fireEvent.changeText(screen.getByTestId('composer-input'), text);

describe('Composer states', () => {
  it('empty: nothing suggested, send disabled', async () => {
    const { onSend } = await setup();
    expect(screen.queryByTestId('scene-chip-attached')).toBeNull();
    expect(screen.queryByTestId('scene-chip-suggest')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('typing the dinner message shows a suggested dinner scene and sends text + scene', async () => {
    const { onSend } = await setup();
    await type(DINNER);
    const chip = await screen.findByTestId('scene-chip-attached');
    expect(chip).toHaveTextContent(/Dinner out/);
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledTimes(1);
    const [text, scene] = onSend.mock.calls[0]!;
    expect(text).toBe(DINNER);
    expect(scene?.catalog_scene_id).toBe('dinner_out');
    expect(scene?.speech_bubble?.text).toBe('Dinner tonight?');
    // The two characters become the chat members.
    expect(scene?.characters.map((c) => c.avatar_id)).toEqual([ME, PEER]);
  });

  it('long-press send = text only, even with a scene attached', async () => {
    const { onSend } = await setup();
    await type(DINNER);
    await screen.findByTestId('scene-chip-attached');
    await fireEvent(screen.getByTestId('send-button'), 'longPress');
    expect(onSend).toHaveBeenCalledWith(DINNER, null);
  });

  it('removing the attached scene sends text only', async () => {
    const { onSend } = await setup();
    await type(DINNER);
    await screen.findByTestId('scene-chip-attached');
    await fireEvent.press(screen.getByTestId('scene-chip-remove'));
    expect(screen.queryByTestId('scene-chip-attached')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(DINNER, null);
  });

  it('mode OFF: no suggestions, plain text send', async () => {
    const { onSend } = await setup({ mode: 'off' });
    await type(DINNER);
    await act(async () => {});
    expect(screen.queryByTestId('scene-chip-attached')).toBeNull();
    expect(screen.queryByTestId('scene-chip-suggest')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(DINNER, null);
  });

  it('mode ASK: send opens the preview; user can send with the scene or text only', async () => {
    const first = await setup({ mode: 'ask' });
    await type(DINNER);
    await screen.findByTestId('scene-chip-suggest');
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(screen.getByTestId('preview-sheet')).toBeTruthy();
    expect(screen.getByTestId('scene-render')).toHaveTextContent('dinner_out');
    await fireEvent.press(screen.getByText('Text only'));
    expect(first.onSend).toHaveBeenCalledWith(DINNER, null);

    await type(DINNER);
    await screen.findByTestId('scene-chip-suggest');
    await fireEvent.press(screen.getByTestId('send-button'));
    await fireEvent.press(screen.getByText('Send with scene'));
    expect(first.onSend).toHaveBeenLastCalledWith(
      DINNER,
      expect.objectContaining({ catalog_scene_id: 'dinner_out' }),
    );
  });

  it('preview lets you swap to an alternative and change intensity', async () => {
    const { onSend } = await setup();
    await type('pizza or ramen tonight?');
    const chip = await screen.findByTestId(/scene-chip-(attached|suggest)/);
    await fireEvent.press(chip);
    await fireEvent.press(await screen.findByTestId('alt-ramen_slurp'));
    await fireEvent.press(screen.getByLabelText('Big'));
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByTestId('send-button'));
    const scene = onSend.mock.calls[0]![1]!;
    expect(scene.catalog_scene_id).toBe('ramen_slurp');
    expect(scene.characters.every((c) => c.intensity === 3)).toBe(true);
  });

  it('moderate confidence: offers a chip but does not attach until tapped', async () => {
    const { onSend } = await setup();
    await type('Boba run?');
    await screen.findByTestId('scene-chip-suggest');
    expect(screen.queryByTestId('scene-chip-attached')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith('Boba run?', null);
  });
});

describe('text is always delivered', () => {
  it('when scene generation throws', async () => {
    const generate = jest.fn(() => {
      throw new Error('engine exploded');
    });
    const { onSend } = await setup({ generate });
    await type(DINNER);
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(screen.queryByTestId('scene-chip-attached')).toBeNull();
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(DINNER, null);
  });

  it('when generation returns a broken scene', async () => {
    const generate = jest.fn(() => {
      const real = suggestScene(DINNER, { ageBracket: 'adult' });
      // characters is not an array → preparing the scene fails
      return {
        ...real,
        scene: { ...real.scene!, characters: null as unknown as Scene['characters'] },
      };
    });
    const { onSend } = await setup({ generate });
    await type(DINNER);
    await screen.findByTestId('scene-chip-attached');
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend).toHaveBeenCalledWith(DINNER, null);
  });
});

describe('age', () => {
  it('a teen never gets a romantic suggestion', async () => {
    const { onSend } = await setup({ ageBracket: 'teen' });
    await type('Romantic dinner tonight?');
    // The romantic scene doesn't exist for teens; the plain dinner scene is offered instead.
    const chip = await screen.findByTestId('scene-chip-suggest');
    expect(chip).toHaveTextContent(/Dinner out/);
    await fireEvent.press(chip);
    expect(screen.queryByTestId('alt-romantic_dinner')).toBeNull();
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByTestId('send-button'));
    expect(onSend.mock.calls[0]![1]?.catalog_scene_id).toBe('dinner_out');
  });
});
