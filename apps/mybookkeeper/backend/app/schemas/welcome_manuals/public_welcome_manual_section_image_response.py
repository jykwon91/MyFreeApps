from pydantic import BaseModel, ConfigDict


class PublicWelcomeManualSectionImageResponse(BaseModel):
    """Guest-safe image projection.

    Deliberately omits ``id``, ``section_id``, and — most importantly —
    ``storage_key``: welcome-manual image object keys are partitioned as
    ``{organization_id}/welcome-manuals/{uuid}/{filename}`` (see
    ``welcome_manual_section_image_service.upload_images``, which builds the
    key via ``storage.generate_key(f"{organization_id}/{WELCOME_MANUAL_STORAGE_DOMAIN}", ...)``),
    so the raw storage key would leak the host's ``organization_id`` to an
    unauthenticated guest. Only the short-lived presigned URL + caption are
    exposed — enough to render the image, nothing that identifies the tenant.

    NOTE: the presigned URL itself still embeds the object key (including
    ``organization_id``) in its path — that residual leak is inherent to the
    current storage-key partitioning scheme and is NOT fixed here (would
    require reworking key generation / storage ACLs, out of scope for this
    PR). See PR description for the flagged follow-up.
    """

    caption: str | None = None
    display_order: int
    presigned_url: str | None = None
    is_available: bool = True

    model_config = ConfigDict(from_attributes=True)
