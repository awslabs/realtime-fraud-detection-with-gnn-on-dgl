FROM public.ecr.aws/lambda/python:3.8

RUN yum install -y tar gzip unzip
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws/

COPY app.py repackage.sh ./
CMD ["app.handler"]