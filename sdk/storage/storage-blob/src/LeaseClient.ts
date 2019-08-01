// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { HttpResponse, generateUuid } from "@azure/core-http";
import * as Models from "../src/generated/lib/models";
import { AbortSignal, AbortSignalLike } from "@azure/abort-controller";
import { ContainerClient } from "./ContainerClient";
import { Blob, Container } from "./generated/lib/operations";
import { StorageClientContext } from "./generated/lib/storageClient";
import { BlobClient } from "./internal";

export interface Lease {
  /**
   * @member {string} [eTag] The ETag contains a value that you can use to
   * perform operations conditionally. If the request version is 2011-08-18 or
   * newer, the ETag value will be in quotes.
   */
  eTag?: string;
  /**
   * @member {Date} [lastModified] Returns the date and time the container was
   * last modified. Any operation that modifies the blob, including an update
   * of the blob's metadata or properties, changes the last-modified time of
   * the blob.
   */
  lastModified?: Date;
  /**
   * @member {string} [leaseId] Uniquely identifies a container's lease
   */
  leaseId?: string;
  /**
   * @member {number} [leaseTime] Approximate time remaining in the lease
   * period, in seconds.
   */
  leaseTime?: number;
  /**
   * @member {string} [requestId] This header uniquely identifies the request
   * that was made and can be used for troubleshooting the request.
   */
  requestId?: string;
  /**
   * @member {string} [version] Indicates the version of the Blob service used
   * to execute the request. This header is returned for requests made against
   * version 2009-09-19 and above.
   */
  version?: string;
  /**
   * @member {Date} [date] UTC date/time value generated by the service that
   * indicates the time at which the response was initiated
   */
  date?: Date;
  /**
   * @member {string} [errorCode]
   */
  errorCode?: string;
}

export type LeaseOperationResponse = Lease & {
  /**
   * The underlying HTTP response.
   */
  _response: HttpResponse & {
    /**
     * The parsed HTTP response headers.
     */
    parsedHeaders: Lease;
  };
};

/**
 * Configures lease operations.
 *
 * @export
 * @interface LeaseOperationOptions
 */
export interface LeaseOperationOptions {
  /**
   * An implementation of the `AbortSignalLike` interface to signal the request to cancel the operation.
   * For example, use the &commat;azure/abort-controller to create an `AbortSignal`.
   *
   * @type {AbortSignalLike}
   * @memberof LeaseOperationOptions
   */
  abortSignal?: AbortSignalLike;
  /**
   * Conditions to meet when changing the lease.
   *
   * @type {Models.ModifiedAccessConditions}
   * @memberof LeaseOperationOptions
   */
  modifiedAccessConditions?: Models.ModifiedAccessConditions;
}

/**
 * A client that manages leases for a ContainerClient or a BlobClient.
 *
 * @export
 * @class LeaseClient
 */
export class LeaseClient {
  private _leaseId: string;
  private _url: string;
  private _containerOrBlobOperation: Container | Blob;

  /**
   * Gets the lease Id.
   *
   * @readonly
   * @memberof LeaseClient
   */
  public get leaseId() {
    return this._leaseId;
  }

  /**
   * Gets the url.
   *
   * @readonly
   * @memberof LeaseClient
   */
  public get url() {
    return this._url;
  }

  /**
   * Creates an instance of LeaseClient.
   * @param {(ContainerClient | BlobClient)} client The client to make the lease operation requests.
   * @param {string} leaseId Initial proposed lease id.
   * @memberof LeaseClient
   */
  constructor(client: ContainerClient | BlobClient, leaseId?: string) {
    const clientContext = new StorageClientContext(
      client.url,
      (client as any).pipeline.toServiceClientOptions()
    );
    this._url = client.url;

    if (client instanceof ContainerClient) {
      this._containerOrBlobOperation = new Container(clientContext);
    } else {
      this._containerOrBlobOperation = new Blob(clientContext);
    }

    if (!leaseId) {
      leaseId = generateUuid();
    }
    this._leaseId = leaseId;
  }

  /**
   * Establishes and manages a lock on a container for delete operations, or on a blob
   * for write and delete operations.
   * The lock duration can be 15 to 60 seconds, or can be infinite.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   * and
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   *
   * @param {number} duration Must be between 15 to 60 seconds, or infinite (-1)
   * @param {LeaseOperationOptions} [options={}] option to configure lease management operations.
   * @returns {Promise<LeaseOperationResponse>} Response data for acquire lease operation.
   * @memberof LeaseClient
   */
  public async acquireLease(
    duration: number,
    options: LeaseOperationOptions = {}
  ): Promise<LeaseOperationResponse> {
    const aborter = options.abortSignal || AbortSignal.none;
    return await this._containerOrBlobOperation.acquireLease({
      abortSignal: aborter,
      duration,
      modifiedAccessConditions: options.modifiedAccessConditions,
      proposedLeaseId: this._leaseId
    });
  }

  /**
   * To change the ID of the lease.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   * and
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   *
   * @param {string} proposedLeaseId the proposed new lease Id.
   * @param {LeaseOperationOptions} [options={}] option to configure lease management operations.
   * @returns {Promise<LeaseOperationResponse>} Response data for change lease operation.
   * @memberof LeaseClient
   */
  public async chanageLease(
    proposedLeaseId: string,
    options: LeaseOperationOptions = {}
  ): Promise<LeaseOperationResponse> {
    const aborter = options.abortSignal || AbortSignal.none;
    const response = await this._containerOrBlobOperation.changeLease(
      this._leaseId,
      proposedLeaseId,
      {
        abortSignal: aborter,
        modifiedAccessConditions: options.modifiedAccessConditions
      }
    );
    this._leaseId = proposedLeaseId;
    return response;
  }

  /**
   * To free the lease if it is no longer needed so that another client may
   * immediately acquire a lease against the container or the blob.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   * and
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   *
   * @param {LeaseOperationOptions} [options={}] option to configure lease management operations.
   * @returns {Promise<LeaseOperationResponse>} Response data for release lease operation.
   * @memberof LeaseClient
   */
  public async releaseLease(options: LeaseOperationOptions = {}): Promise<LeaseOperationResponse> {
    const aborter = options.abortSignal || AbortSignal.none;
    return await this._containerOrBlobOperation.releaseLease(this._leaseId, {
      abortSignal: aborter,
      modifiedAccessConditions: options.modifiedAccessConditions
    });
  }

  /**
   * To renew the lease.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   * and
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   *
   * @param {LeaseOperationOptions} [options={}] Optional option to configure lease management operations.
   * @returns {Promise<LeaseOperationResponse>} Response data for renew lease operation.
   * @memberof LeaseClient
   */
  public async renewLease(options: LeaseOperationOptions = {}): Promise<Lease> {
    const aborter = options.abortSignal || AbortSignal.none;
    return await this._containerOrBlobOperation.renewLease(this._leaseId, {
      abortSignal: aborter,
      modifiedAccessConditions: options.modifiedAccessConditions
    });
  }

  /**
   * To end the lease but ensure that another client cannot acquire a new lease
   * until the current lease period has expired.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
   * and
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   *
   * @static
   * @param {(ContainerClient | BlobClient)} client
   * @param {number} breakPeriod Break period
   * @param {LeaseOperationOptions} [options={}] Optional options to configure lease management operations.
   * @returns {Promise<LeaseOperationResponse>} Response data for break lease operation.
   * @memberof LeaseClient
   */
  public async breakLease(
    breakPeriod: number,
    options: LeaseOperationOptions = {}
  ): Promise<LeaseOperationResponse> {
    const aborter = options.abortSignal || AbortSignal.none;
    const operationOptions = {
      abortSignal: aborter,
      breakPeriod,
      modifiedAccessConditions: options.modifiedAccessConditions
    };
    return await this._containerOrBlobOperation.breakLease(operationOptions);
  }
}
