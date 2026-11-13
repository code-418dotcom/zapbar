import { Redirect } from 'expo-router';
import { useManager, useUi } from '../src/runtime/RuntimeProvider';

export default function Index() {
  const m = useManager();
  const key = useUi((s) => s.activeKey);
  return <Redirect href={key && m.isSetupDone(key) ? '/remote' : '/setup'} />;
}
