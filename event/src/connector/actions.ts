import { Destination, GoogleCloudPubSubDestination, SubscriptionDraft } from '@commercetools/platform-sdk';
import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';

const PRODUCT_SUBSCRIPTION_KEY = 'productCreatedSubscription';

export async function createGcpPubSubProductSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  topicName: string,
  projectId: string
): Promise<void> {
  const destination: GoogleCloudPubSubDestination = {
    type: 'GoogleCloudPubSub',
    topic: topicName,
    projectId,
  };
  await createSubscription(apiRoot, destination);
}

async function createSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  destination: Destination
) {
  await deleteProductSubscription(apiRoot);
  
  const subscriptionDraft: SubscriptionDraft = {
    key: PRODUCT_SUBSCRIPTION_KEY,
    destination,
    messages: [
      {
        resourceTypeId: 'product',
        types: ['ProductCreated'],
      },
    ],
    changes: [
      {
        resourceTypeId: 'product',
      },
    ],
    format: {
      type: 'Platform',
    },
  };

  await apiRoot
    .subscriptions()
    .post({
      body: subscriptionDraft,
    })
    .execute();
}

export async function deleteProductSubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const {
    body: { results: subscriptions },
  } = await apiRoot
    .subscriptions()
    .get({
      queryArgs: {
        where: `key = "${PRODUCT_SUBSCRIPTION_KEY}"`,
      },
    })
    .execute();

  if (subscriptions.length > 0) {
    const subscription = subscriptions[0];

    await apiRoot
      .subscriptions()
      .withKey({ key: PRODUCT_SUBSCRIPTION_KEY })
      .delete({
        queryArgs: {
          version: subscription.version,
        },
      })
      .execute();
  }
}