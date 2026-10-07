import { Redirect } from 'expo-router';

import { useApp } from '@/store/app';

export default function Index() {
  const onboarded = useApp((s) => s.onboarded);
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
