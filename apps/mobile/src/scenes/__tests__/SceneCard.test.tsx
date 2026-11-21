import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { sceneFromCatalog } from '@anime/scene-engine';
import { asScene } from '../sceneSvg';

jest.mock('react-native-svg', () => ({
  SvgXml: () => {
    throw new Error('svg failed to load');
  },
}));

// Imported after the mock so the card uses the failing SvgXml.
import { SceneCard } from '../SceneCard';

describe('scene in a message', () => {
  it('shows text only, without an error, when the scene fails to render', async () => {
    const scene = sceneFromCatalog('dinner_out', { age: 25, bubbleText: 'Dinner tonight?' })!;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await render(
      <View>
        <SceneCard scene={scene} avatars={{}} width={200} id="m1" />
        <Text>Can we go out for dinner tonight?</Text>
      </View>,
    );
    expect(screen.getByText('Can we go out for dinner tonight?')).toBeTruthy();
    expect(screen.queryByLabelText(/Anime scene/)).toBeNull();
  });

  it('ignores invalid scene payloads', () => {
    expect(asScene(null)).toBeNull();
    expect(asScene('nope')).toBeNull();
    expect(asScene({ hello: 'world' })).toBeNull();
    expect(asScene(sceneFromCatalog('dinner_out', { age: 25 }))).not.toBeNull();
  });
});
