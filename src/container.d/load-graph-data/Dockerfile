ARG VERSION=3.8

FROM alpine as builder
COPY script-libs/amazon-neptune-tools/neptune-python-utils/target/neptune_python_utils.zip /data/
RUN mkdir -p /data/site-packages/ && \
    unzip /data/neptune_python_utils.zip -d /data/site-packages/

FROM public.ecr.aws/lambda/python:${VERSION}

RUN yum install -y tar gzip unzip
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws/
RUN python -m pip install --user boto3 certifi
    
COPY container.d/load-graph-data/bulk-load.py container.d/load-graph-data/prepare-data.sh /app/
COPY --from=builder /data/site-packages/ /var/lang/lib/python3.8/site-packages/

ENTRYPOINT ["python", "/app/bulk-load.py"]