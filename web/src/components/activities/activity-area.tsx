'use client';

import type { StoreView } from '@/contracts/stores';
import { ActivityList } from './activity-list';
import { ActivityEditor } from './activity-editor';
import { ActivityDetail } from './activity-detail';
import { SubmissionDetail } from './submission-detail';
import type { ActivityRoute } from './transport';
import styles from './activities.module.css';

export function ActivityArea({ store, accountKey, route }: { store: StoreView; accountKey: string; route: ActivityRoute }) {
  return <div className={styles.area}>
    {route.view === 'list' ? <ActivityList store={store} /> :
      route.view === 'new' ? <ActivityEditor store={store} /> :
        route.view === 'edit' ? <ActivityEditor store={store} activityId={route.activityId} /> :
          route.view === 'submission' ? <SubmissionDetail store={store} accountKey={accountKey} submissionId={route.submissionId} /> :
            <ActivityDetail store={store} accountKey={accountKey} activityId={route.activityId} register={route.view === 'register'} draftId={route.draftId} />}
  </div>;
}
