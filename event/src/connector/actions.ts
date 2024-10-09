import {
  Destination,
  GoogleCloudPubSubDestination,
} from '@commercetools/platform-sdk';
import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';

const ORDER_SUBSCRIPTION_KEY =
  'productCreatedSubscription';

export async function createGcpPubSubOrderSubscription(
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
  await deleteOrderSubscription(apiRoot);
  await apiRoot
    .subscriptions()
    .post({
      body: {
        key: ORDER_SUBSCRIPTION_KEY,
        destination,
        messages: [
          {
            resourceTypeId: 'product',
            types: ['ProductCreated'],
          },
        ],
      },
    })
    .execute();
}

export async function deleteOrderSubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const {
    body: { results: subscriptions },
  } = await apiRoot
    .subscriptions()
    .get({
      queryArgs: {
        where: `key = "${ORDER_SUBSCRIPTION_KEY}"`,
      },
    })
    .execute();

  if (subscriptions.length > 0) {
    const subscription = subscriptions[0];

    await apiRoot
      .subscriptions()
      .withKey({ key: ORDER_SUBSCRIPTION_KEY })
      .delete({
        queryArgs: {
          version: subscription.version,
        },
      })
      .execute();
  }
}
